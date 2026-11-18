import { MigrationInterface, QueryRunner } from "typeorm";

// `programme_completion`'s unique index on (userId, programmeId) is the
// programme.completed emit gate — `challenge_setup.programmeCompletedAt`
// cannot be that gate itself, because that table is one row per user; once
// set, a second programme could never complete. This table is keyed
// (userId, programmeId) instead, and its `completionOrdinal` — minted by the
// same gating INSERT, unique per (userId, completionOrdinal) — is what
// programme.count_reached reports.
//
// `programmeCompletedAt` on `challenge_setup` stays as an unconditional
// read-model convenience, written *after* the gate.
export class ProgrammeCompletion1784720000000 implements MigrationInterface {
  name = "ProgrammeCompletion1784720000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "programme_completion" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "programmeId" text NOT NULL,
        "programmeVersionId" text,
        -- Lifetime ordinal per user, minted by the gating insert
        -- (COALESCE(MAX(...), 0) + 1). programme.count_reached reports this
        -- value directly.
        "completionOrdinal" integer NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_programme_completion_ordinal" CHECK ("completionOrdinal" > 0),
        CONSTRAINT "FK_programme_completion_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The programme.completed emit gate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_programme_completion_user_programme"
      ON "programme_completion" ("userId", "programmeId")
    `);
    // A duplicated ordinal is a hard integrity error rather than a silent
    // double-count.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_programme_completion_user_ordinal"
      ON "programme_completion" ("userId", "completionOrdinal")
    `);

    await queryRunner.query(
      `ALTER TABLE "challenge_setup" ADD COLUMN IF NOT EXISTS "programmeCompletedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP COLUMN IF EXISTS "programmeCompletedAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_completion"`);
  }
}
