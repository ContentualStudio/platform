import {
  eventNameTokens,
  followerMilestoneTiers,
  levelNameSchema,
  levelNames,
  type EventName,
  type FollowerMilestoneTier,
  type LevelName,
} from "@contentual/content-engine-vocabulary";
import { paidSubscriptionStatuses } from "../../billing/subscription-state";
import { taskProgressOutcomes } from "../../programme-tasks/entities/programme-task-progress.entity";
import type { ContentEvent } from "../content-event";
import { contentEventIds } from "../event-ids";
import { returnedRows } from "../returned-rows";
import type { BackfillPage, RuleBackfillScanner } from "./backfill-scanner.port";

// Cursors are opaque to callers and JSON to us. The obvious alternative — a
// ":"-joined string, as event IDs use — would need escaping, because a userId
// or programmeId can hold any text; JSON has that already.
function encodeCursor(value: string): string {
  return JSON.stringify([value]);
}

function decodeCursor(cursor: string | null, keyset: Keyset): string {
  if (cursor === null) {
    // Text comparison starts below every possible value, so an empty string
    // reads as "from the beginning"; a bigint keyset is numeric, so it starts
    // at 0 instead.
    return keyset === "id" ? "0" : "";
  }

  const parsed: unknown = JSON.parse(cursor);

  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`Malformed backfill cursor: ${cursor}`);
  }

  return String(parsed[0]);
}

function integer(value: unknown): number {
  return Number(value);
}

// A Postgres `date` arrives as a string or a Date depending on the column's
// parser, and the event ID must be the same text the live emitter used either
// way.
function localDateText(value: unknown): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
}

type Keyset = "id" | "userId";

/**
 * Placeholder numbering differs between the two queries a family needs — the
 * paged scan binds a cursor and a limit, the user count binds neither — so a
 * shared predicate cannot hard-code `$2`. It is written against this instead,
 * where `extra(1)` is the family's first extra parameter whichever query is
 * being built.
 */
type Placeholder = (index: number) => string;

interface ScannerConfig<Row> {
  readonly eventName: EventName;
  readonly unreconstructibleFields?: readonly string[];
  readonly table: string;
  readonly keyset: Keyset;
  readonly columns: string;
  /**
   * The liveness predicate — what makes this family's state *currently* true.
   * Shared verbatim by the page scan and the user count, which is the point of
   * this whole indirection: two hand-written copies of `"brokenAt" IS NULL`
   * would eventually disagree, and the count would quietly describe a different
   * population than the one being fired.
   */
  readonly predicate?: (extra: Placeholder) => string;
  readonly extraParams?: readonly unknown[];
  readonly groupBy?: string;
  readonly distinctOnUser?: boolean;
  readonly orderBy?: string;
  readonly toCandidates: (row: Row) => ContentEvent[];
}

function defineScanner<Row>(config: ScannerConfig<Row>): RuleBackfillScanner {
  const extraParams = config.extraParams ?? [];

  const conditions = (extra: Placeholder, includeCursor: boolean): string => {
    const parts = includeCursor ? [`"${config.keyset}" > $1`] : [];
    const predicate = config.predicate?.(extra);

    if (predicate) {
      parts.push(predicate);
    }

    return parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  };

  return {
    eventName: config.eventName,
    unreconstructibleFields: config.unreconstructibleFields ?? [],

    async scanPage(manager, cursor, limit): Promise<BackfillPage> {
      // $1 cursor, $2 limit, then the family's own parameters.
      const where = conditions((index) => `$${index + 2}`, true);
      const distinct = config.distinctOnUser ? `DISTINCT ON ("userId") ` : "";
      const order = config.orderBy ?? `"${config.keyset}"`;
      const group = config.groupBy ? `GROUP BY ${config.groupBy}` : "";

      const rows = returnedRows<Row & Record<Keyset, string>>(
        await manager.query(
          `SELECT ${distinct}${config.columns}
             FROM "${config.table}"
             ${where}
             ${group}
            ORDER BY ${order}
            LIMIT $2`,
          [decodeCursor(cursor, config.keyset), limit, ...extraParams],
        ),
      );

      const candidates = rows.flatMap((row) => config.toCandidates(row));

      return {
        candidates,
        // A short page is the last page. One extra query returning nothing
        // would double the round trips for no information, and this scan is
        // deliberately gentle with the database.
        //
        // The cursor comes from the last *row*, never the last candidate: a
        // page can legitimately produce no candidates (a follower snapshot
        // below every tier) while later rows still qualify, so paging must
        // stop on the cursor and never on emptiness.
        cursor:
          rows.length < limit
            ? null
            : encodeCursor(String(rows[rows.length - 1][config.keyset])),
      };
    },

    async countUsers(manager): Promise<number> {
      const rows = returnedRows<{ count: string }>(
        await manager.query(
          `SELECT COUNT(DISTINCT "userId") AS "count"
             FROM "${config.table}"
             ${conditions((index) => `$${index}`, false)}`,
          [...extraParams],
        ),
      );

      return integer(rows[0]?.count ?? 0);
    },
  };
}

interface UserRow {
  userId: string;
}

interface TaskProgressRow extends UserRow {
  id: string;
  programmeId: string;
  assignmentId?: string;
  taskId: string;
  localDate: string;
  contentType: string;
}

interface StreakRow extends UserRow {
  currentLength: number;
  runOrdinal: number;
}

/**
 * `programme.completed` — one candidate per completed-programme record.
 *
 * A completion is permanent, so every stored row is still true today. That is
 * what makes this family backfillable at all: nothing here has to guess whether
 * a past fact still holds.
 */
const programmeCompletedScanner = defineScanner<
  UserRow & { id: string; programmeId: string; assignmentId?: string }
>({
  eventName: eventNameTokens.programmeCompleted,
  table: "programme_completion",
  keyset: "id",
  columns: `"id", "userId", "programmeId", "assignmentId"`,
  toCandidates: (row) => [
    {
      id: contentEventIds.programmeCompleted({
        userId: row.userId,
        programmeId: row.programmeId,
        assignmentId: row.assignmentId,
      }),
      eventName: eventNameTokens.programmeCompleted,
      userId: row.userId,
      payload: { userId: row.userId, programmeId: row.programmeId },
    },
  ],
});

/**
 * `programme.count_reached` — one candidate per user, at their *current* total.
 *
 * Only the total they stand at now, never the totals they passed through. A
 * user on their fifth completion gets one candidate for 5, not five candidates
 * for 1..5: the earlier crossings are history, and this backfill reports state.
 * A rule with a `gte` condition still matches, which is how such rules are
 * written; a rule pinned with `eq` to a total the user has already passed does
 * not, and should not.
 */
const programmeCountReachedScanner = defineScanner<UserRow & { count: string }>({
  eventName: eventNameTokens.programmeCountReached,
  table: "programme_completion",
  keyset: "userId",
  columns: `"userId", COUNT(*) AS "count"`,
  groupBy: `"userId"`,
  toCandidates: (row) => [
    {
      id: contentEventIds.programmeCountReached({
        userId: row.userId,
        count: integer(row.count),
      }),
      eventName: eventNameTokens.programmeCountReached,
      userId: row.userId,
      payload: { userId: row.userId, count: integer(row.count) },
    },
  ],
});

/**
 * `programme.started` — the programme a user is currently on.
 *
 * `challenge_setup` holds one assignment per user, so a user who started,
 * finished and was reassigned yields a candidate for the assignment they hold
 * now. Their earlier programmes are not reachable from this row and are not
 * reconstructed.
 */
const programmeStartedScanner = defineScanner<
  UserRow & { programmeId: string; assignmentId?: string }
>(
  {
    eventName: eventNameTokens.programmeStarted,
    table: "challenge_setup",
    keyset: "userId",
    columns: `"userId", "assignedProgrammeId" AS "programmeId", "assignedProgrammeAssignmentId" AS "assignmentId"`,
    predicate: () =>
      `"programmeStartedAt" IS NOT NULL AND "assignedProgrammeId" IS NOT NULL`,
    toCandidates: (row) => [
      {
        id: contentEventIds.programmeStarted({
          userId: row.userId,
          programmeId: row.programmeId,
          assignmentId: row.assignmentId,
        }),
        eventName: eventNameTokens.programmeStarted,
        userId: row.userId,
        payload: { userId: row.userId, programmeId: row.programmeId },
      },
    ],
  },
);

/**
 * `week.completed` — one candidate per completed-week record. Permanent, like a
 * programme completion.
 */
const weekCompletedScanner = defineScanner<
  UserRow & {
    id: string;
    programmeId: string;
    assignmentId?: string;
    weekIndex: number;
  }
>({
  eventName: eventNameTokens.weekCompleted,
  table: "programme_week_completion",
  keyset: "id",
  columns: `"id", "userId", "programmeId", "assignmentId", "weekIndex"`,
  toCandidates: (row) => [
    {
      id: contentEventIds.weekCompleted({
        userId: row.userId,
        programmeId: row.programmeId,
        assignmentId: row.assignmentId,
        weekIndex: integer(row.weekIndex),
      }),
      eventName: eventNameTokens.weekCompleted,
      userId: row.userId,
      payload: {
        userId: row.userId,
        programmeId: row.programmeId,
        weekIndex: integer(row.weekIndex),
      },
    },
  ],
});

/**
 * `task.completed` — one candidate per completed-task record.
 *
 * The highest-volume family by a wide margin, which is what the page size and
 * the pause between pages exist for. The row itself carries everything the
 * event needs, including the `contentType` a condition is most likely to read.
 */
const taskCompletedScanner = defineScanner<TaskProgressRow>({
  eventName: eventNameTokens.taskCompleted,
  table: "programme_task_progress",
  keyset: "id",
  columns: `"id", "userId", "programmeId", "assignmentId", "taskId", "localDate", "contentType"`,
  predicate: (extra) => `"outcome" = ${extra(1)}`,
  extraParams: [taskProgressOutcomes.completed],
  toCandidates: (row) => [
    {
      id: contentEventIds.taskCompleted({
        userId: row.userId,
        programmeId: row.programmeId,
        assignmentId: row.assignmentId,
        taskId: row.taskId,
        localDate: localDateText(row.localDate),
      }),
      eventName: eventNameTokens.taskCompleted,
      userId: row.userId,
      payload: {
        userId: row.userId,
        programmeId: row.programmeId,
        taskId: row.taskId,
        contentType: row.contentType,
      },
    },
  ],
});

/**
 * `task.skipped` — one candidate per skipped-task record.
 *
 * `consecutiveSkipCount` was a running count at the moment of the skip and is
 * not stored, so it is declared unreconstructible: a rule that reads it is
 * refused rather than answered with the zero this payload carries.
 */
const taskSkippedScanner = defineScanner<TaskProgressRow>({
  eventName: eventNameTokens.taskSkipped,
  unreconstructibleFields: ["consecutiveSkipCount"],
  table: "programme_task_progress",
  keyset: "id",
  columns: `"id", "userId", "programmeId", "assignmentId", "taskId", "localDate"`,
  predicate: (extra) => `"outcome" = ${extra(1)}`,
  extraParams: [taskProgressOutcomes.skipped],
  toCandidates: (row) => [
    {
      id: contentEventIds.taskSkipped({
        userId: row.userId,
        programmeId: row.programmeId,
        assignmentId: row.assignmentId,
        taskId: row.taskId,
        localDate: localDateText(row.localDate),
      }),
      eventName: eventNameTokens.taskSkipped,
      userId: row.userId,
      payload: {
        userId: row.userId,
        programmeId: row.programmeId,
        taskId: row.taskId,
        consecutiveSkipCount: 0,
      },
    },
  ],
});

/**
 * `streak.reached` — users whose streak is *currently* running, at the length
 * they are on.
 *
 * `brokenAt IS NULL` is the acceptance criterion about facts that are no longer
 * true, expressed as a predicate: a user who reached 30 days and then lapsed is
 * not a user with a 30-day streak, and a badge for it would be wrong today
 * however true it was last month.
 *
 * Only the current length, not every length the run passed through — a 12-day
 * streak yields one candidate, not twelve.
 */
const streakReachedScanner = defineScanner<StreakRow>({
  eventName: eventNameTokens.streakReached,
  table: "user_streak",
  keyset: "userId",
  columns: `"userId", "currentLength", "runOrdinal"`,
  predicate: () => `"brokenAt" IS NULL AND "currentLength" > 0`,
  toCandidates: (row) => [
    {
      id: contentEventIds.streakReached({
        userId: row.userId,
        runOrdinal: integer(row.runOrdinal),
        streakLength: integer(row.currentLength),
      }),
      eventName: eventNameTokens.streakReached,
      userId: row.userId,
      payload: { userId: row.userId, streakLength: integer(row.currentLength) },
    },
  ],
});

/**
 * `streak.broken` — users whose streak is broken *right now*.
 *
 * The mirror image of the scanner above, and true for the same reason: a
 * lapsed streak is a current state, not a past transition. A user who lapsed
 * and has since started a new run is excluded, because `brokenAt` is cleared
 * when the run rolls over.
 */
const streakBrokenScanner = defineScanner<StreakRow>({
  eventName: eventNameTokens.streakBroken,
  table: "user_streak",
  keyset: "userId",
  columns: `"userId", "currentLength", "runOrdinal"`,
  predicate: () => `"brokenAt" IS NOT NULL AND "currentLength" > 0`,
  toCandidates: (row) => [
    {
      id: contentEventIds.streakBroken({
        userId: row.userId,
        runOrdinal: integer(row.runOrdinal),
      }),
      eventName: eventNameTokens.streakBroken,
      userId: row.userId,
      payload: { userId: row.userId, priorLength: integer(row.currentLength) },
    },
  ],
});

/**
 * `streak.resumed` — users whose live run is not their first.
 *
 * "Resumed" reads as a transition, but `runOrdinal > 1` on an unbroken run is a
 * present-tense fact: this user is on a comeback run right now. Earlier
 * resumptions are not reconstructed — only the run they are on.
 */
const streakResumedScanner = defineScanner<StreakRow>({
  eventName: eventNameTokens.streakResumed,
  table: "user_streak",
  keyset: "userId",
  columns: `"userId", "runOrdinal"`,
  predicate: () => `"brokenAt" IS NULL AND "runOrdinal" > 1`,
  toCandidates: (row) => [
    {
      id: contentEventIds.streakResumed({
        userId: row.userId,
        runOrdinal: integer(row.runOrdinal),
      }),
      eventName: eventNameTokens.streakResumed,
      userId: row.userId,
      payload: { userId: row.userId },
    },
  ],
});

// The level one rung below, for the placeholder `previousLevel`. Never treated
// as a fact — `previousLevel` is declared unreconstructible, so no condition
// may read it — but the payload has to satisfy the vocabulary schema, and a
// value from the real ladder is less likely to be mistaken for signal than an
// invented one.
function levelBelow(level: LevelName): LevelName {
  const index = levelNames.indexOf(level);

  return index > 0 ? levelNames[index - 1] : levelNames[0];
}

/**
 * `level.changed` — the level each user holds now.
 *
 * `user_level` stores the current level and the ordinal of the change that
 * reached it, but never the level it came from, so `previousLevel` cannot be
 * recovered. Rather than fabricate one and let a condition compare against it,
 * the field is declared unreconstructible and rules that read it are refused.
 */
const levelChangedScanner = defineScanner<
  UserRow & { level: string; changeOrdinal: number }
>({
  eventName: eventNameTokens.levelChanged,
  unreconstructibleFields: ["previousLevel"],
  table: "user_level",
  keyset: "userId",
  columns: `"userId", "level", "changeOrdinal"`,
  // Seeding writes changeOrdinal 0 for every user who has ever completed a
  // task; those users never had a level *change*.
  predicate: () => `"changeOrdinal" > 0`,
  toCandidates: (row) => {
    // A level the vocabulary no longer names — a renamed rung, a row written by
    // an older build — is dropped rather than coerced. The alternative is
    // firing a level rule against a level nobody can author a condition for.
    const level = levelNameSchema.safeParse(row.level);

    if (!level.success) {
      return [];
    }

    return [
      {
        id: contentEventIds.levelChanged({
          userId: row.userId,
          changeOrdinal: integer(row.changeOrdinal),
        }),
        eventName: eventNameTokens.levelChanged,
        userId: row.userId,
        payload: {
          userId: row.userId,
          newLevel: level.data,
          previousLevel: levelBelow(level.data),
        },
      },
    ];
  },
});

/**
 * `platform.connected` — connections that are still connected.
 *
 * `disconnectedAt IS NULL` keeps a since-revoked connection out, and the unique
 * index behind that predicate means at most one live connection per user and
 * platform.
 */
const platformConnectedScanner = defineScanner<
  UserRow & { id: string; platform: string; connectionOrdinal: number }
>({
  eventName: eventNameTokens.platformConnected,
  table: "platform_connection",
  keyset: "id",
  columns: `"id", "userId", "platform", "connectionOrdinal"`,
  predicate: () => `"disconnectedAt" IS NULL`,
  toCandidates: (row) => [
    {
      id: contentEventIds.platformConnected({
        userId: row.userId,
        platform: row.platform,
        connectionOrdinal: integer(row.connectionOrdinal),
      }),
      eventName: eventNameTokens.platformConnected,
      userId: row.userId,
      payload: { userId: row.userId, platform: row.platform },
    },
  ],
});

/**
 * `follower.milestone` — every tier the user's latest snapshot clears.
 *
 * One page of *users*, each expanded to up to three candidates, so a page here
 * costs more firing decisions than its limit suggests. Tiers are re-derived
 * from the snapshot rather than read from `follower_milestone`, which is what
 * the ticket asks for and is also the more forgiving source: a milestone row
 * that was never written still gets its rule.
 *
 * `DISTINCT ON` takes the newest snapshot per user. A user tracked on more than
 * one platform therefore reports whichever platform reported most recently —
 * only Instagram writes snapshots today, and a per-platform milestone would
 * need a platform field in the payload, which the vocabulary does not have.
 */
const followerMilestoneScanner = defineScanner<
  UserRow & { followerCount: number }
>({
  eventName: eventNameTokens.followerMilestone,
  table: "follower_snapshot",
  keyset: "userId",
  columns: `"userId", "followerCount"`,
  distinctOnUser: true,
  orderBy: `"userId", "localDate" DESC, "id" DESC`,
  toCandidates: (row) => {
    const followerCount = integer(row.followerCount);

    return followerMilestoneTiers
      .filter((tier) => tier <= followerCount)
      .map((tier) => ({
        id: contentEventIds.followerMilestone({ userId: row.userId, tier }),
        eventName: eventNameTokens.followerMilestone,
        userId: row.userId,
        payload: {
          userId: row.userId,
          tier: tier as FollowerMilestoneTier,
          followerCount,
        },
      }));
  },
});

interface SubscriptionRow extends UserRow {
  stripeSubscriptionId: string;
  tier: string;
  isFoundingCreator: boolean | null;
}

// The live emitter keys the billing events by the Stripe event that
// confirmed them, which a backfill cannot know. The subscription id is the
// next best stable fact: one candidate per user per subscription, and the
// firing ledger's dedupe scope keeps a rule from firing twice for the same
// user whichever id the candidate carries.
const backfillEventId = (stripeSubscriptionId: string): string =>
  `backfill_${stripeSubscriptionId}`;

/**
 * `subscription.started` — every subscription that currently entitles a paid
 * tier. The founding flag is read from the account rather than the payload
 * the live event carried, which is the same fact.
 */
const subscriptionStartedScanner = defineScanner<SubscriptionRow>({
  eventName: eventNameTokens.subscriptionStarted,
  table: "user_subscription",
  keyset: "userId",
  columns: `
    "userId", "stripeSubscriptionId", "tier",
    (
      SELECT "isFoundingCreator" FROM "billing_account"
      WHERE "billing_account"."userId" = "user_subscription"."userId"
    ) AS "isFoundingCreator"`,
  predicate: (extra) => `"status" = ANY(${extra(1)}::text[])`,
  extraParams: [paidSubscriptionStatuses],
  toCandidates: (row) => [
    {
      id: contentEventIds.subscriptionStarted({
        userId: row.userId,
        stripeEventId: backfillEventId(row.stripeSubscriptionId),
      }),
      eventName: eventNameTokens.subscriptionStarted,
      userId: row.userId,
      payload: {
        userId: row.userId,
        tier: row.tier,
        foundingCreator: row.isFoundingCreator === true,
      },
    },
  ],
});

/**
 * `subscription.ended` — every subscription that was paid and no longer is.
 * `incomplete` rows never entitled anything, so they never ended.
 */
const subscriptionEndedScanner = defineScanner<SubscriptionRow>({
  eventName: eventNameTokens.subscriptionEnded,
  table: "user_subscription",
  keyset: "userId",
  columns: `"userId", "stripeSubscriptionId", "tier", NULL::boolean AS "isFoundingCreator"`,
  predicate: (extra) => `NOT ("status" = ANY(${extra(1)}::text[]))`,
  extraParams: [[...paidSubscriptionStatuses, "incomplete", "incomplete_expired"]],
  toCandidates: (row) => [
    {
      id: contentEventIds.subscriptionEnded({
        userId: row.userId,
        stripeEventId: backfillEventId(row.stripeSubscriptionId),
      }),
      eventName: eventNameTokens.subscriptionEnded,
      userId: row.userId,
      payload: { userId: row.userId, previousTier: row.tier },
    },
  ],
});

/**
 * One scanner per event family, keyed by event name.
 *
 * `satisfies Record<EventName, ...>` is the point of the type annotation: a
 * thirteenth event added to the vocabulary breaks this build until somebody
 * decides what its stored state is, rather than silently becoming a family the
 * team cannot roll a rule out to.
 */
export const ruleBackfillScanners = {
  [eventNameTokens.taskCompleted]: taskCompletedScanner,
  [eventNameTokens.taskSkipped]: taskSkippedScanner,
  [eventNameTokens.programmeStarted]: programmeStartedScanner,
  [eventNameTokens.programmeCompleted]: programmeCompletedScanner,
  [eventNameTokens.programmeCountReached]: programmeCountReachedScanner,
  [eventNameTokens.streakReached]: streakReachedScanner,
  [eventNameTokens.streakBroken]: streakBrokenScanner,
  [eventNameTokens.streakResumed]: streakResumedScanner,
  [eventNameTokens.weekCompleted]: weekCompletedScanner,
  [eventNameTokens.levelChanged]: levelChangedScanner,
  [eventNameTokens.platformConnected]: platformConnectedScanner,
  [eventNameTokens.followerMilestone]: followerMilestoneScanner,
  [eventNameTokens.subscriptionStarted]: subscriptionStartedScanner,
  [eventNameTokens.subscriptionEnded]: subscriptionEndedScanner,
} as const satisfies Partial<Record<EventName, RuleBackfillScanner>>;

/** Families whose stored state keeps no history to replay, with the reason. */
export const unsupportedBackfillEvents = {
  [eventNameTokens.subscriptionChanged]:
    "app Postgres keeps only the current tier, not the history of switches",
} as const;

// Compile-time check: every event is scannable or explicitly unsupported.
type UncoveredEvent = Exclude<
  EventName,
  keyof typeof ruleBackfillScanners | keyof typeof unsupportedBackfillEvents
>;
export const backfillCoversEveryEvent: [UncoveredEvent] extends [never] ? true : UncoveredEvent = true;

export function backfillUnsupportedReason(eventName: EventName): string | undefined {
  return (unsupportedBackfillEvents as Partial<Record<EventName, string>>)[eventName];
}

export function backfillScannerFor(eventName: EventName): RuleBackfillScanner {
  const scanner = (ruleBackfillScanners as Partial<Record<EventName, RuleBackfillScanner>>)[eventName];

  if (!scanner) {
    throw new Error(`${eventName} cannot be backfilled: ${backfillUnsupportedReason(eventName)}`);
  }

  return scanner;
}
