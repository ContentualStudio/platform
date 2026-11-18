import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import {
  eventNameTokens,
  levelNames,
  type LevelName,
} from "@contentual/content-engine-vocabulary";
import { ContentEventBatch } from "../content-engine/event-batch";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { returnedRows } from "../content-engine/returned-rows";
import { baseLevel, levelForCompletions } from "./levels";

const SEED_STREAK_SQL = `
  INSERT INTO "user_streak"
    ("userId", "lastActiveDate", "runStartedDate", "currentLength", "longestLength", "runOrdinal")
  VALUES ($1, $2::date, $2::date, 1, 1, 1)
  ON CONFLICT ("userId") DO NOTHING
  RETURNING "runOrdinal", "currentLength"
`;

const EXTEND_STREAK_SQL = `
  UPDATE "user_streak"
     SET "currentLength" = "currentLength" + 1,
         "longestLength" = GREATEST("longestLength", "currentLength" + 1),
         "lastActiveDate" = $2::date,
         "updatedAt" = now()
   WHERE "userId" = $1
     AND "lastActiveDate" = $2::date - 1
  RETURNING "runOrdinal", "currentLength"
`;

// Locks the row before reading it so the old values (needed for
// streak.broken's priorLength and the run being resumed) and the new values
// come from one atomic statement.
const ROLL_OVER_STREAK_SQL = `
  WITH "previous" AS (
    SELECT "runOrdinal", "currentLength", "brokenAt"
    FROM "user_streak"
    WHERE "userId" = $1
    FOR UPDATE
  )
  UPDATE "user_streak" AS "u"
     SET "runOrdinal" = "previous"."runOrdinal" + 1,
         "currentLength" = 1,
         "longestLength" = GREATEST("u"."longestLength", 1),
         "runStartedDate" = $2::date,
         "lastActiveDate" = $2::date,
         "brokenAt" = NULL,
         "updatedAt" = now()
    FROM "previous"
   WHERE "u"."userId" = $1
     AND "u"."lastActiveDate" < ($2::date - 1)
  RETURNING "previous"."runOrdinal" AS "previousRunOrdinal",
            "previous"."currentLength" AS "previousLength",
            "previous"."brokenAt" AS "previousBrokenAt",
            "u"."runOrdinal" AS "runOrdinal"
`;

const SEED_LEVEL_SQL = `
  INSERT INTO "user_level" ("userId", "level", "changeOrdinal")
  VALUES ($1, $2, 0)
  ON CONFLICT ("userId") DO NOTHING
`;

// The emit-once predicate compares *rank* ($3 is the vocabulary's level
// ladder, ordered), not equality: `lifetimeTaskCompletions` is counted before
// this row is locked, so two concurrent completions can race here with two
// different, both-honest counts. Equality would let whichever commits last
// win regardless of which count was larger — including a demotion, if the
// smaller (stale) count's writer acquires the lock second. Comparing rank
// makes the level move only forward, so the writer with the higher-ranked
// result always wins no matter the commit order. The row lock still makes
// the read-then-write atomic; only the comparison itself changed.
const CHANGE_LEVEL_SQL = `
  WITH "previous" AS (
    SELECT "level", "changeOrdinal"
    FROM "user_level"
    WHERE "userId" = $1
    FOR UPDATE
  )
  UPDATE "user_level" AS "u"
     SET "level" = $2,
         "changeOrdinal" = "previous"."changeOrdinal" + 1,
         "updatedAt" = now()
    FROM "previous"
   WHERE "u"."userId" = $1
     AND array_position($3::text[], $2) > array_position($3::text[], "previous"."level")
  RETURNING "previous"."level" AS "previousLevel",
            "u"."changeOrdinal" AS "changeOrdinal"
`;

// The eager sweep's break: reports a streak broken by an elapsed gap rather
// than waiting for the user's next completion to discover it lazily.
const SWEEP_BREAK_SQL = `
  UPDATE "user_streak"
     SET "brokenAt" = now()
   WHERE "userId" = $1
     AND "brokenAt" IS NULL
     AND "lastActiveDate" < ($2::date - 1)
  RETURNING "runOrdinal", "currentLength"
`;

interface StreakRow {
  runOrdinal: number;
  currentLength: number;
}

interface RollOverRow {
  previousRunOrdinal: number;
  previousLength: number;
  previousBrokenAt: Date | null;
  runOrdinal: number;
}

interface LevelChangeRow {
  // Only ever written by SEED_LEVEL_SQL / CHANGE_LEVEL_SQL, both of which
  // bind a `LevelName` — safe to type the column as one on the way back out.
  previousLevel: LevelName;
  changeOrdinal: number;
}

export interface RecordTaskCompletionInput {
  readonly userId: string;
  readonly localDate: string;
  readonly lifetimeTaskCompletions: number;
}

export interface RecordStreakBreaksInput {
  readonly userId: string;
  readonly asOfLocalDate: string;
}

// Injects only the emitter: this service never owns a transaction or
// dispatches after commit. Every caller supplies the `EntityManager` of its
// own fact transaction and the `ContentEventBatch` it will dispatch once that
// transaction resolves.
@Injectable()
export class GamificationService {
  constructor(private readonly eventEmitter: ContentEventEmitter) {}

  async recordTaskCompletion(
    manager: EntityManager,
    batch: ContentEventBatch,
    input: RecordTaskCompletionInput,
  ): Promise<void> {
    await this.recordStreakProgress(manager, batch, input);
    await this.recordLevelProgress(manager, batch, input);
  }

  // The three statements below are tried in order; the first to return a row
  // is what happened. Same-day (a second task the same day, or a replay) and
  // an out-of-order earlier day match none of them, so they are silent no-ops
  // by construction — not a special case.
  private async recordStreakProgress(
    manager: EntityManager,
    batch: ContentEventBatch,
    input: RecordTaskCompletionInput,
  ): Promise<void> {
    const { userId, localDate } = input;

    // Seed (first ever completion) and extend (the day right after the last
    // one) are the same shape — try each SQL attempt in turn and stop at the
    // first that actually wrote a row.
    for (const sql of [SEED_STREAK_SQL, EXTEND_STREAK_SQL]) {
      const [row] = returnedRows<StreakRow>(await manager.query(sql, [userId, localDate]));

      if (row) {
        await this.emitStreakReached(manager, batch, userId, row);
        return;
      }
    }

    const [rolledOver] = returnedRows<RollOverRow>(
      await manager.query(ROLL_OVER_STREAK_SQL, [userId, localDate]),
    );

    if (!rolledOver) {
      return;
    }

    // Belt and braces: even if the eager sweep already reported this break,
    // the identical stable ID and payload make a second emit here a no-op in
    // the outbox rather than a collision — this check just avoids the
    // redundant call.
    if (rolledOver.previousBrokenAt === null) {
      const brokenEvent = await this.eventEmitter.emit(manager, {
        eventId: contentEventIds.streakBroken({
          userId,
          runOrdinal: rolledOver.previousRunOrdinal,
        }),
        eventName: eventNameTokens.streakBroken,
        payload: { userId, priorLength: rolledOver.previousLength },
      });
      batch.add(brokenEvent.id);
    }

    const resumedEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.streakResumed({
        userId,
        runOrdinal: rolledOver.runOrdinal,
      }),
      eventName: eventNameTokens.streakResumed,
      payload: { userId },
    });
    batch.add(resumedEvent.id);

    await this.emitStreakReached(manager, batch, userId, {
      runOrdinal: rolledOver.runOrdinal,
      currentLength: 1,
    });
  }

  private async emitStreakReached(
    manager: EntityManager,
    batch: ContentEventBatch,
    userId: string,
    row: StreakRow,
  ): Promise<void> {
    const event = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.streakReached({
        userId,
        runOrdinal: row.runOrdinal,
        streakLength: row.currentLength,
      }),
      eventName: eventNameTokens.streakReached,
      payload: { userId, streakLength: row.currentLength },
    });
    batch.add(event.id);
  }

  private async recordLevelProgress(
    manager: EntityManager,
    batch: ContentEventBatch,
    input: RecordTaskCompletionInput,
  ): Promise<void> {
    const { userId, lifetimeTaskCompletions } = input;
    const nextLevel = levelForCompletions(lifetimeTaskCompletions);

    // Seeding at the computed level would silently swallow the user's first
    // promotion, so this always seeds at the base level regardless of how
    // many completions this user already has.
    await manager.query(SEED_LEVEL_SQL, [userId, baseLevel]);

    const [changed] = returnedRows<LevelChangeRow>(
      await manager.query(CHANGE_LEVEL_SQL, [userId, nextLevel, levelNames]),
    );

    if (!changed) {
      return;
    }

    const event = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.levelChanged({
        userId,
        changeOrdinal: changed.changeOrdinal,
      }),
      eventName: eventNameTokens.levelChanged,
      payload: {
        userId,
        newLevel: nextLevel,
        previousLevel: changed.previousLevel,
      },
    });
    batch.add(event.id);
  }

  // The eager path: sweeps a user whose streak has gone quiet, reporting the
  // break without waiting for their next completion to discover it lazily.
  // `currentLength` is deliberately left untouched here so a later lazy
  // roll-over reports the same priorLength and — guarded by `brokenAt IS NOT
  // NULL` — skips re-emitting it.
  async recordStreakBreaks(
    manager: EntityManager,
    batch: ContentEventBatch,
    input: RecordStreakBreaksInput,
  ): Promise<void> {
    const [broken] = returnedRows<StreakRow>(
      await manager.query(SWEEP_BREAK_SQL, [input.userId, input.asOfLocalDate]),
    );

    if (!broken) {
      return;
    }

    const event = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.streakBroken({
        userId: input.userId,
        runOrdinal: broken.runOrdinal,
      }),
      eventName: eventNameTokens.streakBroken,
      payload: { userId: input.userId, priorLength: broken.currentLength },
    });
    batch.add(event.id);
  }
}
