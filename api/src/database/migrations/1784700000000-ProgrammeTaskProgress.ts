import { MigrationInterface, QueryRunner } from "typeorm";

// Programme task completion/skip history and the per-week completion gate.
//
// `programme_task_progress`'s unique index on (userId, programmeId, taskId,
// outcome, localDate) *is* the idempotency guarantee and the task.completed /
// task.skipped emit gate in one: a task is completable (or skippable) once
// per user-local day, and a redone tap the same day is a replay rather than a
// second event. `weekIndex` and `contentType` are denormalised at write time
// from the published programme_tasks mirror so a row's payload never depends
// on a later catalogue edit.
//
// `programme_week_completion`'s unique index on (userId, programmeId,
// weekIndex) is the week.completed gate — it stops two concurrent
// completions of a week's last two tasks from both emitting.
export class ProgrammeTaskProgress1784700000000 implements MigrationInterface {
  name = "ProgrammeTaskProgress1784700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "programme_task_progress" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "programmeId" text NOT NULL,
        "taskId" text NOT NULL,
        "outcome" text NOT NULL,
        "weekIndex" integer NOT NULL,
        "contentType" text NOT NULL,
        "localDate" date NOT NULL,
        "recordedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_programme_task_progress_outcome"
          CHECK ("outcome" IN ('completed', 'skipped')),
        CONSTRAINT "FK_programme_task_progress_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The idempotency guarantee and the task.completed/task.skipped emit gate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_programme_task_progress_day"
      ON "programme_task_progress" ("userId", "programmeId", "taskId", "outcome", "localDate")
    `);
    // Serves the streak write path's "did this user complete anything today"
    // read.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_programme_task_progress_user_day"
      ON "programme_task_progress" ("userId", "localDate")
    `);
    // Serves the week-completion count: distinct tasks completed for a given
    // programme/week.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_programme_task_progress_week"
      ON "programme_task_progress" ("userId", "programmeId", "weekIndex")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "programme_week_completion" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "programmeId" text NOT NULL,
        "weekIndex" integer NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_programme_week_completion_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // The week.completed emit gate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_programme_week_completion"
      ON "programme_week_completion" ("userId", "programmeId", "weekIndex")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_week_completion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_task_progress"`);
  }
}
