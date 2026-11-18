import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MatchingProfile } from "@contentual/programme-matching-vocabulary";
import type { SqlQueryable } from "../../database/queryable";
import {
  PRODUCT_ANALYTICS,
  noopProductAnalytics,
  type ProductAnalytics,
} from "../../observability/product-analytics.port";
import { productEventTokens } from "../../observability/product-events";
import { MatchingConfigurationError } from "./programme-matching.repository";
import type { ProgrammeMatchResult } from "./programme-matching.types";
import { evaluateLegacyProgramme } from "./legacy-programme-matching";

export type MatchingRolloutMode = "legacy" | "shadow" | "published";

export const LEGACY_PROGRAMME_MATCHER = Symbol("LEGACY_PROGRAMME_MATCHER");
export const MATCHING_ROLLOUT = Symbol("MATCHING_ROLLOUT");

export interface LegacyProgrammeMatcher {
  match(
    profile: MatchingProfile,
    queryable?: SqlQueryable,
  ): Promise<ProgrammeMatchResult>;
}

interface SelectionIdentity {
  programmeKey: string;
  programmeVersionId: string;
  fallbackUsed: boolean;
}

export interface MatchingComparison {
  match: boolean;
  legacy: SelectionIdentity;
  published: SelectionIdentity;
}

function selection(result: ProgrammeMatchResult): SelectionIdentity {
  return {
    programmeKey: result.trace.selectedProgrammeKey,
    programmeVersionId: result.trace.selectedProgrammeVersionId,
    fallbackUsed: result.trace.fallbackUsed,
  };
}

/**
 * Compares only the logical assignment. Programme publication IDs are
 * intentionally excluded from the decision comparison: the legacy and CMS
 * paths can legitimately point at different immutable snapshots of the same
 * programme. The matching profile, explanation, and considered conditions are
 * deliberately absent so shadow telemetry cannot become a second store of
 * onboarding answers or free text.
 */
export function compareMatchingResults(
  legacy: ProgrammeMatchResult,
  published: ProgrammeMatchResult,
): MatchingComparison {
  const legacySelection = selection(legacy);
  const publishedSelection = selection(published);

  return {
    match:
      legacySelection.programmeKey === publishedSelection.programmeKey &&
      legacySelection.fallbackUsed === publishedSelection.fallbackUsed,
    legacy: legacySelection,
    published: publishedSelection,
  };
}

export function matchingRolloutMode(value: unknown): MatchingRolloutMode {
  return value === "legacy" || value === "shadow" || value === "published"
    ? value
    : "shadow";
}

/**
 * The legacy implementation is intentionally isolated and temporary. It is a
 * rollback seam, not a second authored rule source: it reproduces the released
 * catch-all decision and then resolves that choice to an immutable content
 * snapshot in the application database.
 */
export class EnvironmentLegacyProgrammeMatcher implements LegacyProgrammeMatcher {
  async match(
    profile: MatchingProfile,
    queryable?: SqlQueryable,
  ): Promise<ProgrammeMatchResult> {
    const selection = evaluateLegacyProgramme(profile);

    if (!queryable) {
      throw new MatchingConfigurationError(
        "The legacy matcher requires a transaction queryable.",
        "LEGACY_MATCHING_QUERYABLE_REQUIRED",
      );
    }

    const rows = (await queryable.query(
      `SELECT "programmeVersionId"
       FROM "programme_content_versions"
       WHERE "programmeKey" = $1
       ORDER BY "createdAt" DESC, "programmeVersionId" DESC
       LIMIT 1`,
      [selection.programmeKey],
    )) as Array<{ programmeVersionId?: unknown }>;
    const programmeVersionId = rows[0]?.programmeVersionId;

    if (typeof programmeVersionId !== "string" || !programmeVersionId) {
      throw new MatchingConfigurationError(
        `The legacy programme ${selection.programmeKey} has no immutable content version.`,
        "LEGACY_PROGRAMME_CONTENT_UNAVAILABLE",
      );
    }

    return {
      profile,
      trace: {
        setupVersionId: selection.algorithmVersion,
        selectedRuleId: selection.ruleId,
        selectedRuleName: selection.ruleName,
        selectedProgrammeKey: selection.programmeKey,
        selectedProgrammeVersionId: programmeVersionId,
        explanation: selection.explanation,
        fallbackUsed: selection.fallbackUsed,
        multipleRulesQualified: false,
        qualifyingRuleIds: [],
        considered: [],
      },
    };
  }
}

@Injectable()
export class MatchingRollout {
  private readonly logger = new Logger(MatchingRollout.name);
  private readonly mode: MatchingRolloutMode;

  constructor(
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics = noopProductAnalytics,
    @Inject(LEGACY_PROGRAMME_MATCHER)
    private readonly legacy: LegacyProgrammeMatcher =
      new EnvironmentLegacyProgrammeMatcher(),
    @Optional()
    @Inject(ConfigService)
    modeOrConfig?: MatchingRolloutMode | ConfigService,
  ) {
    const configured =
      typeof modeOrConfig === "string"
        ? modeOrConfig
        : modeOrConfig?.get<MatchingRolloutMode>("matchingRollout.mode");
    this.mode = matchingRolloutMode(
      configured ?? process.env.PROGRAMME_MATCHING_ROLLOUT,
    );
  }

  /**
   * Evaluates according to the reversible cutover flag. Shadow evaluates both
   * paths but keeps the released legacy result authoritative until the flag
   * switches to published; legacy remains selectable for an emergency rollback.
   */
  async evaluate(
    userId: string,
    profile: MatchingProfile,
    queryable: SqlQueryable | undefined,
    published: () => Promise<ProgrammeMatchResult>,
  ): Promise<ProgrammeMatchResult> {
    if (this.mode === "legacy") {
      return this.legacy.match(profile, queryable);
    }

    if (this.mode === "published") {
      return published();
    }

    let legacyResult: ProgrammeMatchResult;

    try {
      legacyResult = await this.legacy.match(profile, queryable);
    } catch (error) {
      // Shadowing must not turn a functioning published matcher into an
      // onboarding outage while the rollback implementation is unavailable.
      // The CMS result is a safe temporary fallback for this exceptional case.
      this.logger.warn(
        `Legacy matcher unavailable during shadow evaluation: ${
          error instanceof Error ? error.constructor.name : "unknown"
        }`,
      );
      const publishedResult = await published();
      this.captureMismatch(
        userId,
        {
          match: false,
          legacy: {
            programmeKey: "",
            programmeVersionId: "",
            fallbackUsed: false,
          },
          published: selection(publishedResult),
        },
        false,
      );
      return publishedResult;
    }

    let publishedResult: ProgrammeMatchResult;

    try {
      publishedResult = await published();
    } catch (error) {
      this.logger.warn(
        `Published matcher unavailable during shadow evaluation: ${
          error instanceof Error ? error.constructor.name : "unknown"
        }`,
      );
      this.captureMismatch(
        userId,
        {
          match: false,
          legacy: selection(legacyResult),
          published: {
            programmeKey: "",
            programmeVersionId: "",
            fallbackUsed: false,
          },
        },
        true,
        false,
      );
      return legacyResult;
    }
    const comparison = compareMatchingResults(legacyResult, publishedResult);

    if (!comparison.match) {
      this.captureMismatch(userId, comparison, true);
    }

    // During the shadow window the released decision remains authoritative.
    // The published path is fully evaluated and observed, but the assignment
    // only switches when PROGRAMME_MATCHING_ROLLOUT becomes "published".
    return legacyResult;
  }

  private captureMismatch(
    userId: string,
    comparison: MatchingComparison,
    legacyAvailable: boolean,
    publishedAvailable = true,
  ): void {
    this.analytics.capture({
      identity: { userId },
      event: productEventTokens.programmeMatchingShadowMismatch,
      properties: {
        mode: this.mode,
        match: comparison.match,
        legacyAvailable,
        publishedAvailable,
        legacyProgrammeKey: comparison.legacy.programmeKey,
        legacyProgrammeVersionId: comparison.legacy.programmeVersionId,
        legacyFallbackUsed: comparison.legacy.fallbackUsed,
        publishedProgrammeKey: comparison.published.programmeKey,
        publishedProgrammeVersionId: comparison.published.programmeVersionId,
        publishedFallbackUsed: comparison.published.fallbackUsed,
      },
    });
  }
}
