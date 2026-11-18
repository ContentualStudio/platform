import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enrolment state for linear programme delivery.
 *
 * One active row per user (partial unique index). The day pointer is the next
 * programme day the 7am timezone sweep should serve; the serve ledger makes
 * that serve forward-only and idempotent. Mirror gaps discovered at serve time
 * are recorded for the content-mirror backfill job.
 */
export class ProgrammeEnrolment1785020000000 implements MigrationInterface {
  name = "ProgrammeEnrolment1785020000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_enrolment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" text NOT NULL,
        "programmeSlug" text NOT NULL,
        "programmeVersionId" text,
        "assignmentId" uuid,
        "status" text NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "currentDay" integer NOT NULL,
        "lastServedDay" integer,
        "durationDays" integer NOT NULL,
        "day1ScheduledFor" date NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "abandonedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_programme_enrolment_status"
          CHECK ("status" IN ('active', 'completed', 'abandoned')),
        CONSTRAINT "CHK_programme_enrolment_current_day"
          CHECK ("currentDay" > 0),
        CONSTRAINT "CHK_programme_enrolment_last_served_day"
          CHECK ("lastServedDay" IS NULL OR "lastServedDay" > 0),
        CONSTRAINT "CHK_programme_enrolment_duration"
          CHECK ("durationDays" > 0),
        CONSTRAINT "FK_programme_enrolment_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_programme_enrolment_assignment"
          FOREIGN KEY ("assignmentId") REFERENCES "programme_assignment"("id")
          ON DELETE SET NULL
      )
    `);

    // At most one active enrolment per user — the one-programme rule.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_enrolment_one_active_per_user"
      ON "programme_enrolment" ("userId")
      WHERE "status" = 'active'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_programme_enrolment_active_delivery"
      ON "programme_enrolment" ("status", "day1ScheduledFor")
      WHERE "status" = 'active'
    `);

    await queryRunner.query(`
      CREATE TABLE "programme_day_serve" (
        "id" bigserial PRIMARY KEY,
        "enrolmentId" uuid NOT NULL,
        "userId" text NOT NULL,
        "programmeSlug" text NOT NULL,
        "programmeDay" integer NOT NULL,
        "localDate" date NOT NULL,
        "taskId" text,
        "outcome" text NOT NULL,
        "servedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_programme_day_serve_day"
          CHECK ("programmeDay" > 0),
        CONSTRAINT "CHK_programme_day_serve_outcome"
          CHECK ("outcome" IN ('served', 'gap_skipped')),
        CONSTRAINT "FK_programme_day_serve_enrolment"
          FOREIGN KEY ("enrolmentId") REFERENCES "programme_enrolment"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_programme_day_serve_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Re-serving the same enrolment day is a no-op at the schema layer.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_day_serve_enrolment_day"
      ON "programme_day_serve" ("enrolmentId", "programmeDay")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_programme_day_serve_user_local_date"
      ON "programme_day_serve" ("userId", "localDate")
    `);

    await queryRunner.query(`
      CREATE TABLE "programme_task_mirror_gap" (
        "id" bigserial PRIMARY KEY,
        "programmeSlug" text NOT NULL,
        "programmeDay" integer NOT NULL,
        "enrolmentId" uuid,
        "userId" text,
        "localDate" date,
        "recordedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_programme_task_mirror_gap_day"
          CHECK ("programmeDay" > 0),
        CONSTRAINT "FK_programme_task_mirror_gap_enrolment"
          FOREIGN KEY ("enrolmentId") REFERENCES "programme_enrolment"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_programme_task_mirror_gap_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);

    // One gap row per missing programme day is enough for the backfill job.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_task_mirror_gap_day"
      ON "programme_task_mirror_gap" ("programmeSlug", "programmeDay")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_task_mirror_gap"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_day_serve"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_enrolment"`);
  }
}
