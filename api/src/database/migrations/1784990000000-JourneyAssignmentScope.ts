import { MigrationInterface, QueryRunner } from "typeorm";

/** Scopes every journey gate to one immutable assignment attempt. */
export class JourneyAssignmentScope1784990000000 implements MigrationInterface {
  name = "JourneyAssignmentScope1784990000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD COLUMN "assignedProgrammeAssignmentId" uuid
    `);
    for (const table of [
      "programme_task_progress",
      "programme_week_completion",
      "programme_completion",
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD COLUMN "assignmentId" uuid
      `);
    }

    await queryRunner.query(`
      UPDATE "challenge_setup" setup
      SET "assignedProgrammeAssignmentId" = assignment."id"
      FROM "programme_assignment" assignment
      WHERE assignment."userId" = setup."userId"
        AND assignment."active" = true
    `);
    await this.backfillHistory(
      queryRunner,
      "programme_task_progress",
      "recordedAt",
    );
    await this.backfillHistory(
      queryRunner,
      "programme_week_completion",
      "completedAt",
    );
    await this.backfillHistory(
      queryRunner,
      "programme_completion",
      "completedAt",
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "challenge_setup"
          WHERE "assignedProgrammeId" IS NOT NULL
            AND "assignedProgrammeAssignmentId" IS NULL
        ) OR EXISTS (
          SELECT 1 FROM "programme_task_progress" WHERE "assignmentId" IS NULL
        ) OR EXISTS (
          SELECT 1 FROM "programme_week_completion" WHERE "assignmentId" IS NULL
        ) OR EXISTS (
          SELECT 1 FROM "programme_completion" WHERE "assignmentId" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot scope journey history: a row has no matching programme assignment.';
        END IF;
      END
      $$
    `);

    for (const table of [
      "programme_task_progress",
      "programme_week_completion",
      "programme_completion",
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "assignmentId" SET NOT NULL,
        ADD CONSTRAINT "FK_${table}_assignment"
          FOREIGN KEY ("assignmentId") REFERENCES "programme_assignment" ("id")
      `);
    }
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD CONSTRAINT "FK_challenge_setup_assigned_programme_assignment"
        FOREIGN KEY ("assignedProgrammeAssignmentId")
        REFERENCES "programme_assignment" ("id")
    `);

    await queryRunner.query(`
      DROP INDEX "UQ_programme_task_progress_day";
      CREATE UNIQUE INDEX "UQ_programme_task_progress_assignment_day"
        ON "programme_task_progress"
        ("assignmentId", "taskId", "outcome", "localDate")
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_programme_week_completion";
      CREATE UNIQUE INDEX "UQ_programme_week_completion_assignment"
        ON "programme_week_completion" ("assignmentId", "weekIndex")
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_programme_completion_user_programme";
      CREATE UNIQUE INDEX "UQ_programme_completion_assignment"
        ON "programme_completion" ("assignmentId")
    `);
  }

  private async backfillHistory(
    queryRunner: QueryRunner,
    table: string,
    timestamp: string,
  ): Promise<void> {
    await queryRunner.query(`
      UPDATE "${table}" history
      SET "assignmentId" = (
        SELECT candidate."id"
        FROM "programme_assignment" candidate
        WHERE candidate."userId" = history."userId"
          AND candidate."programmeKey" = history."programmeId"
          AND candidate."matchedAt" <= history."${timestamp}"
        ORDER BY candidate."matchedAt" DESC, candidate."createdAt" DESC
        LIMIT 1
      )
      WHERE history."assignmentId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "UQ_programme_completion_assignment";
      CREATE UNIQUE INDEX "UQ_programme_completion_user_programme"
        ON "programme_completion" ("userId", "programmeId")
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_programme_week_completion_assignment";
      CREATE UNIQUE INDEX "UQ_programme_week_completion"
        ON "programme_week_completion" ("userId", "programmeId", "weekIndex")
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_programme_task_progress_assignment_day";
      CREATE UNIQUE INDEX "UQ_programme_task_progress_day"
        ON "programme_task_progress"
        ("userId", "programmeId", "taskId", "outcome", "localDate")
    `);
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      DROP CONSTRAINT "FK_challenge_setup_assigned_programme_assignment",
      DROP COLUMN "assignedProgrammeAssignmentId"
    `);
    for (const table of [
      "programme_task_progress",
      "programme_week_completion",
      "programme_completion",
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        DROP CONSTRAINT "FK_${table}_assignment",
        DROP COLUMN "assignmentId"
      `);
    }
  }
}
