import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  publishedMatchingSetupSchema,
  type PublishedMatchingSetup,
} from "@contentual/programme-matching-vocabulary";
import type { SqlQueryable } from "../../database/queryable";

export const PROGRAMME_MATCHING_READER = Symbol("PROGRAMME_MATCHING_READER");

export interface ProgrammeMatchingReader {
  loadActiveSetup(queryable?: SqlQueryable): Promise<PublishedMatchingSetup>;
}

/**
 * A matching setup that cannot be used.
 *
 * Deliberately its own error type rather than a Nest HTTP exception: this is a
 * configuration failure, not a user-facing condition, and the caller decides
 * how to fail closed. Every path that raises it must leave no completion state
 * behind.
 */
export class MatchingConfigurationError extends Error {
  constructor(
    message: string,
    readonly reasonCode: string,
    readonly setupVersionId?: string,
  ) {
    super(message);
    this.name = "MatchingConfigurationError";
  }
}

// One query, not two. This runs inside the completion transaction while it
// holds a pessimistic lock on the user's setup row, so every avoidable round
// trip is lock held for nothing. The version columns repeat on each rule row,
// which costs nothing at a handful of rules.
//
// LEFT JOIN deliberately: a version whose rules went missing must still come
// back so it fails as a *corrupt* setup rather than masquerading as "nothing
// published". Rules are ordered by the author's own arrangement, not by
// priority — the evaluator does its own ordering, and preserving authoring
// order keeps a preview listing rules where an operator expects them.
const ACTIVE_SETUP_SQL = `
  SELECT
    version."setupVersionId", version."publishedAt",
    rule."ruleId", rule."name", rule."programmeKey", rule."programmeVersionId",
    rule."active", rule."priority", rule."fallback", rule."explanation",
    rule."conditions"
  FROM "active_programme_matching_setup" AS pointer
  JOIN "programme_matching_setup_versions" AS version
    ON version."setupVersionId" = pointer."setupVersionId"
  LEFT JOIN "programme_matching_rules" AS rule
    ON rule."setupVersionId" = version."setupVersionId"
  ORDER BY rule."position", rule."ruleId"
`;

interface SetupRow {
  setupVersionId: string;
  publishedAt: Date | string;
  ruleId: string | null;
  name: string | null;
  programmeKey: string | null;
  programmeVersionId: string | null;
  active: boolean | null;
  priority: number | null;
  fallback: boolean | null;
  explanation: string | null;
  conditions: unknown;
}

function toRule(row: SetupRow) {
  return {
    id: row.ruleId,
    name: row.name,
    programmeKey: row.programmeKey,
    programmeVersionId: row.programmeVersionId,
    active: row.active,
    // Postgres hands back `integer` as a number, but a driver or a view could
    // widen it to a numeric string; coercing here keeps the failure at parse
    // time rather than in an arithmetic comparison.
    priority: row.priority === null ? null : Number(row.priority),
    fallback: row.fallback,
    explanation: row.explanation,
    conditions: row.conditions,
  };
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

@Injectable()
export class ProgrammeMatchingRepository implements ProgrammeMatchingReader {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // The snapshot is re-validated on every load, not trusted because it was
  // valid when published. The catalogue it was written against can move
  // underneath it — an option renamed, a field withdrawn — and a rule that no
  // longer type-checks must stop matching rather than quietly never firing.
  async loadActiveSetup(
    queryable: SqlQueryable = this.dataSource,
  ): Promise<PublishedMatchingSetup> {
    const rows = (await queryable.query(ACTIVE_SETUP_SQL)) as SetupRow[];
    const version = rows[0];

    if (!version) {
      throw new MatchingConfigurationError(
        "No matching setup is currently published.",
        "NO_ACTIVE_MATCHING_SETUP",
      );
    }

    const parsed = publishedMatchingSetupSchema.safeParse({
      setupVersionId: version.setupVersionId,
      publishedAt: timestamp(version.publishedAt),
      rules: rows.map(toRule),
    });

    if (!parsed.success) {
      throw new MatchingConfigurationError(
        `Matching setup ${version.setupVersionId} is not usable: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
        "CORRUPT_MATCHING_SETUP",
        version.setupVersionId,
      );
    }

    return parsed.data;
  }
}
