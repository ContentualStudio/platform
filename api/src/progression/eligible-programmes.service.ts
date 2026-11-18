import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { tierKeys, type TierKey } from "../billing/billing-tiers";
import {
  EntitlementService,
  programmeAccessible,
} from "../billing/entitlement.service";
import {
  PROGRAMME_CONTENT_READER,
  type ActiveProgramme,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import type { SqlQueryable } from "../database/queryable";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";

// DISTINCT ON keeps the earliest unlock per programme: a rule that fires twice
// for the same user must not put the same programme in the list twice, and the
// first unlock is the one the newly-unlocked watermark should be compared to.
const SELECT_UNLOCKS_SQL = `
  SELECT DISTINCT ON ("programmeId")
         "programmeId", "createdAt"
  FROM "engine_programme_unlock"
  WHERE "userId" = $1
  ORDER BY "programmeId", "createdAt"
`;

const SELECT_LAST_VIEWED_SQL = `
  SELECT "lastViewedAt"
  FROM "user_eligible_programmes_view"
  WHERE "userId" = $1
`;

const UPSERT_LAST_VIEWED_SQL = `
  INSERT INTO "user_eligible_programmes_view" ("userId", "lastViewedAt")
  VALUES ($1, $2)
  ON CONFLICT ("userId") DO UPDATE SET "lastViewedAt" = EXCLUDED."lastViewedAt"
`;

export interface EligibleProgramme {
  /** The key every other surface and the start path use. Never a name. */
  readonly slug: string;
  readonly title: string;
  readonly track: string | null;
  readonly durationDays: number;
  readonly durationLabel: string;
  readonly description: string;
  /** Whether the programme is gated at all, as authored in the CMS. */
  readonly locked: boolean;
  /** True when an unlock record put this programme within reach. */
  readonly unlocked: boolean;
  readonly unlockedAt: string | null;
  /** Unlocked since the user last opened the list. */
  readonly newlyUnlocked: boolean;
  /** The user's running programme: shown as active, offered no start. */
  readonly active: boolean;
  readonly minimumTier: TierKey;
  /** Above the user's plan: listed so the upgrade path shows, but not startable. */
  readonly requiresUpgrade: boolean;
  /** Another programme is running; this one can start once that one ends. */
  readonly startBlockedByActive: boolean;
  /** Distinct platforms and content types across the programme's tasks. */
  readonly targetPlatforms: readonly string[];
  readonly targetContentTypes: readonly string[];
}

/** Why a user may not start a programme right now. */
export type StartRefusal = "locked" | "requires_upgrade";

/**
 * This user's unlocks, keyed by the slug everything user-facing uses.
 *
 * Effect rows reference the mirror document id, so the active set is what
 * translates them. An unlock whose programme is missing or no longer active
 * has no identity there and drops out silently — never an error.
 */
function unlocksBySlug(
  unlocks: readonly { programmeId: string; createdAt: Date | string }[],
  active: readonly ActiveProgramme[],
): Map<string, Date> {
  const slugForDocument = new Map(
    active.map((entry) => [entry.sourceDocumentId, entry.programme.id]),
  );
  const unlockedAtBySlug = new Map<string, Date>();

  for (const unlock of unlocks) {
    const slug = slugForDocument.get(unlock.programmeId);

    if (slug) {
      unlockedAtBySlug.set(slug, new Date(unlock.createdAt));
    }
  }

  return unlockedAtBySlug;
}

/**
 * May this user start this programme? Open programmes always; locked ones
 * only with an unlock on record.
 */
function isStartable(
  programme: Programme,
  unlockedAtBySlug: ReadonlyMap<string, Date>,
): boolean {
  return programme.access !== "locked" || unlockedAtBySlug.has(programme.id);
}

@Injectable()
export class EligibleProgrammesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * Every programme this user may currently start: the open ones, plus the
   * locked ones the engine has recorded an unlock for.
   *
   * Nothing in Phase 1 is locked, so in practice this is every active
   * programme today. The gate is built anyway because locking one is then a
   * content edit rather than a deploy.
   */
  async listForUser(user: AuthenticatedUser): Promise<EligibleProgramme[]> {
    const [active, unlocks, lastViewedAt, enrolment, entitlements] =
      await Promise.all([
        this.contentReader.listActiveProgrammesWithIdentity(),
        this.unlocksFor(user.id),
        this.lastViewedAt(user.id),
        this.enrolments.findActiveForUser(user.id),
        this.entitlements.resolve(user.id),
      ]);

    const open = active.map((entry) => entry.programme);
    const unlockedAtBySlug = unlocksBySlug(unlocks, active);

    const activeSlug = enrolment?.programmeSlug ?? null;
    const targets = await this.targetsFor(open);

    // Two different questions, deliberately not one collection: what the user
    // may *start*, and what this list *renders*. A locked programme the user
    // is already running belongs on screen so it can carry its "currently
    // active" treatment — but it must not thereby become startable, which is
    // what folding it into the eligible set would have meant.
    return open
      .filter(
        (programme) =>
          isStartable(programme, unlockedAtBySlug) ||
          programme.id === activeSlug,
      )
      .map((programme) => {
        const unlockedAt = unlockedAtBySlug.get(programme.id) ?? null;

        return {
          slug: programme.id,
          title: programme.title,
          track: programme.track ?? null,
          durationDays: programme.durationDays,
          durationLabel: programme.durationLabel,
          description: programme.description,
          locked: programme.access === "locked",
          unlocked: unlockedAt !== null,
          unlockedAt: unlockedAt?.toISOString() ?? null,
          newlyUnlocked:
            unlockedAt !== null &&
            (lastViewedAt === null || unlockedAt > lastViewedAt),
          active: programme.id === activeSlug,
          minimumTier: programme.minimumTier ?? tierKeys.free,
          requiresUpgrade: !programmeAccessible(
            entitlements,
            programme.minimumTier,
          ),
          startBlockedByActive:
            activeSlug !== null && programme.id !== activeSlug,
          targetPlatforms: targets.get(programme.id)?.platforms ?? [],
          targetContentTypes: targets.get(programme.id)?.contentTypes ?? [],
        };
      });
  }

  /**
   * The single eligibility answer every start surface consults.
   *
   * Reads the same open set, the same unlock records and the same plan the
   * list does, so the two cannot disagree — but asks only the start question.
   * The list's extra "show the programme I am already on" rule deliberately
   * does not apply here: being on a programme is not permission to start one.
   */
  async isEligible(user: AuthenticatedUser, slug: string): Promise<boolean> {
    const programme = await this.findOffered(slug);

    return programme
      ? (await this.startRefusal(user.id, programme)) === null
      : false;
  }

  /** A programme currently offered for new enrolment, by slug. */
  async findOffered(
    slug: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<Programme | undefined> {
    const active =
      await this.contentReader.listActiveProgrammesWithIdentity(queryable);

    return active.find((entry) => entry.programme.id === slug)?.programme;
  }

  /**
   * The start gate every start path consults: a locked programme needs an
   * unlock on record, and the plan must cover the programme's tier. Null when
   * the user may start it. Pass the transaction to read inside it.
   */
  async startRefusal(
    userId: string,
    programme: Programme,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<StartRefusal | null> {
    if (programme.access === "locked") {
      const [active, unlocks] = await Promise.all([
        this.contentReader.listActiveProgrammesWithIdentity(queryable),
        this.unlocksFor(userId, queryable),
      ]);

      if (!unlocksBySlug(unlocks, active).has(programme.id)) {
        return "locked";
      }
    }

    const entitlements = await this.entitlements.resolve(userId, queryable);

    return programmeAccessible(entitlements, programme.minimumTier)
      ? null
      : "requires_upgrade";
  }

  /** Moves the newly-unlocked watermark to now. */
  async markSeen(user: AuthenticatedUser, seenAt = new Date()): Promise<void> {
    await this.dataSource.query(UPSERT_LAST_VIEWED_SQL, [user.id, seenAt]);
  }

  private async unlocksFor(
    userId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<{ programmeId: string; createdAt: Date | string }[]> {
    return queryable.query(SELECT_UNLOCKS_SQL, [userId]) as Promise<
      { programmeId: string; createdAt: Date | string }[]
    >;
  }

  private async targetsFor(
    programmes: readonly Programme[],
  ): Promise<Map<string, { platforms: string[]; contentTypes: string[] }>> {
    const entries = await Promise.all(
      programmes.map(async (programme) => {
        const tasks = await this.contentReader.tasksForProgramme(programme.id);

        return [
          programme.id,
          {
            platforms: distinct(tasks.map((task) => task.platform)),
            contentTypes: distinct(tasks.map((task) => task.contentType)),
          },
        ] as const;
      }),
    );

    return new Map(entries);
  }

  private async lastViewedAt(userId: string): Promise<Date | null> {
    const [row] = (await this.dataSource.query(SELECT_LAST_VIEWED_SQL, [
      userId,
    ])) as { lastViewedAt: Date | string }[];

    return row ? new Date(row.lastViewedAt) : null;
  }
}

function distinct(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
