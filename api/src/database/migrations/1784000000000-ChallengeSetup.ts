import { MigrationInterface, QueryRunner } from "typeorm";

export class ChallengeSetup1784000000000 implements MigrationInterface {
  name = "ChallengeSetup1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Environments that predate this migration already have the table, created
    // by TypeORM synchronize. Both the table and its foreign key are therefore
    // created conditionally so the migration can baseline an existing database.
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "challenge_setup" ("userId" text NOT NULL, "platforms" text array, "postingGoal" text, "weeklyCommitment" integer, "nicheDefined" text, "contentType" text, "followerRange" text, "instagramConnected" boolean NOT NULL DEFAULT false, "milestone" text, "setupCompletedAt" TIMESTAMP WITH TIME ZONE, "assignedProgrammeId" text, "programmeStartedAt" TIMESTAMP WITH TIME ZONE, "day1ScheduledFor" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_challenge_setup_userId" PRIMARY KEY ("userId"))`,
    );
    // Matched on shape rather than name: a synchronize-created foreign key has
    // an auto-generated name, so checking for "FK_challenge_setup_userId"
    // would miss it and then fail on the duplicate.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'challenge_setup'::regclass AND contype = 'f'
        ) THEN
          ALTER TABLE "challenge_setup"
            ADD CONSTRAINT "FK_challenge_setup_userId"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP CONSTRAINT IF EXISTS "FK_challenge_setup_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_setup"`);
  }
}
