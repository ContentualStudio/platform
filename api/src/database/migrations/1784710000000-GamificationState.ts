import { MigrationInterface, QueryRunner } from "typeorm";

// `user_streak` and `user_level` are the durable facts behind
// streak.reached/broken/resumed and level.changed.
//
// `runOrdinal` is what makes a re-reached streak length a genuinely new event
// after a break: lengths increase strictly by 1 within one run, so a length
// is reached once per run, but a new run can reach it again.
//
// `changeOrdinal` on `user_level` is the whole emit-once predicate for
// level.changed (`"level" <> $next`) plus the discriminator in its stable ID
// — there is deliberately no CHECK constraint restating the five level names;
// the vocabulary package owns that token set.
export class GamificationState1784710000000 implements MigrationInterface {
  name = "GamificationState1784710000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_streak" (
        "userId" text PRIMARY KEY,
        "lastActiveDate" date NOT NULL,
        "runStartedDate" date NOT NULL,
        "currentLength" integer NOT NULL,
        "longestLength" integer NOT NULL,
        -- Increments on every break-then-resume. The discriminator that makes
        -- a length reached again, after a break, a new event rather than a
        -- replay of the same stable ID.
        "runOrdinal" integer NOT NULL DEFAULT 1,
        -- NULL means this run's break, if any, has not been reported yet by
        -- the eager sweep or the lazy roll-over.
        "brokenAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_user_streak_current_length" CHECK ("currentLength" > 0),
        CONSTRAINT "CHK_user_streak_longest_length" CHECK ("longestLength" > 0),
        CONSTRAINT "CHK_user_streak_run_ordinal" CHECK ("runOrdinal" > 0),
        CONSTRAINT "FK_user_streak_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_level" (
        "userId" text PRIMARY KEY,
        "level" text NOT NULL,
        "changeOrdinal" integer NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_user_level_change_ordinal" CHECK ("changeOrdinal" >= 0),
        CONSTRAINT "FK_user_level_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_level"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_streak"`);
  }
}
