import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Immutable assignment history.
 *
 * `challenge_setup` records *that* a user has a programme; this table records
 * how they got it and under which exact versions, and it keeps every earlier
 * answer rather than overwriting one column set per user. That distinction is
 * the whole point: rules and programme content both move, and an assignment
 * has to stay explainable after they do.
 *
 * The duplicated columns on `challenge_setup` are left in place on purpose.
 * They are still what the status endpoint and the welcome page read, and
 * dropping them in the same change that introduces their replacement would
 * couple this migration to a deploy ordering it cannot control. Removing them
 * is its own migration, once every reader has moved.
 */
export class ProgrammeAssignmentHistory1784940000000
  implements MigrationInterface
{
  name = "ProgrammeAssignmentHistory1784940000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_assignment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,

        -- What was assigned, pinned. The key alone would let a republished
        -- programme change a live user's journey underneath them.
        "programmeKey" text NOT NULL,
        "programmeVersionId" text NOT NULL,

        -- How it was decided. Not foreign keys: an assignment must survive an
        -- old setup version being purged, and a dangling reference here is
        -- still honest history where a cascade-deleted row would be silence.
        "setupVersionId" text NOT NULL,
        "winningRuleId" text NOT NULL,
        "fallbackUsed" boolean NOT NULL,
        "multipleRulesQualified" boolean NOT NULL,

        -- The structured answers the decision actually read, and the
        -- condition-level trace that explains it. Free text never reaches
        -- either: the matching profile has no key for it.
        "structuredAnswers" jsonb NOT NULL,
        "trace" jsonb NOT NULL,

        "matchedAt" timestamptz NOT NULL,

        -- Supersession, not mutation. An authorised rematch closes the current
        -- row and inserts a new one, so the reason a user changed programme is
        -- part of the record rather than a lost previous value.
        "active" boolean NOT NULL DEFAULT true,
        "supersededAt" timestamptz,
        "resetReason" text,
        "resetActor" text,

        "createdAt" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "CHK_programme_assignment_superseded_shape"
          CHECK (("active" AND "supersededAt" IS NULL)
                 OR (NOT "active" AND "supersededAt" IS NOT NULL))
      )
    `);

    // The concurrency guard. Two simultaneous completions both insert; the
    // second violates this index and loses, which is what makes "exactly one
    // assignment per user" true without depending on a lock being taken
    // correctly at every call site.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_assignment_one_active_per_user"
      ON "programme_assignment" ("userId")
      WHERE "active"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_assignment_user_matched_at"
      ON "programme_assignment" ("userId", "matchedAt" DESC)
    `);
    // Monitoring reads distribution and fallback rate off these two.
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_assignment_matched_at"
      ON "programme_assignment" ("matchedAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_assignment_setup_version"
      ON "programme_assignment" ("setupVersionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_assignment"`);
  }
}
