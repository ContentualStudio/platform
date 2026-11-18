import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Durable per-channel delivery record for the 7am daily task notice.
 *
 * The inbox table already dedupes in-app delivery per user and day, but email
 * had no equivalent: an in-app opt-out meant every retry resent the email,
 * and a transient provider failure was forgotten as soon as the inbox row
 * existed. One row per user, local day, served programme day and channel —
 * written only after the send succeeds — makes each channel retry-safe
 * independently of the other.
 */
export class DailyTaskNoticeDelivery1785120000000
  implements MigrationInterface
{
  name = "DailyTaskNoticeDelivery1785120000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "daily_task_notice_delivery" (
        "id" bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        "localDate" date NOT NULL,
        "programmeDay" integer NOT NULL,
        "channel" text NOT NULL,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_daily_task_notice_delivery_day"
          CHECK ("programmeDay" > 0),
        CONSTRAINT "CHK_daily_task_notice_delivery_channel"
          CHECK ("channel" IN ('in_app', 'email')),
        CONSTRAINT "FK_daily_task_notice_delivery_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Re-delivering the same morning is a no-op at the schema layer.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_daily_task_notice_delivery"
      ON "daily_task_notice_delivery" ("userId", "localDate", "programmeDay", "channel")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_daily_task_notice_delivery_user_day"
      ON "daily_task_notice_delivery" ("userId", "localDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "daily_task_notice_delivery"`,
    );
  }
}
