import { MigrationInterface, QueryRunner } from "typeorm";

const MIRROR_WRITER_ROLE = "content_mirror_writer";
const MIRROR_READER_ROLE = "content_mirror_reader";

/**
 * Extends the published-content mirror for the First Take authoring model.
 *
 * Payload remains the source of truth. The nullable schedule/relationship
 * columns are intentional: existing mirror rows were authored against the
 * legacy programme -> lesson and task -> lesson model and must stay readable
 * until those documents are migrated and republished.
 */
export class FirstTakeContentMirrors1784800000000
  implements MigrationInterface
{
  name = "FirstTakeContentMirrors1784800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD COLUMN "attachmentsIds" text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      UPDATE "studio_lessons"
      SET "attachmentsIds" = CASE
        WHEN "pdfTemplateId" IS NULL THEN '{}'
        ELSE ARRAY["pdfTemplateId"]::text[]
      END
    `);
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      DROP COLUMN "pdfTemplateId"
    `);

    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD COLUMN "durationDays" integer,
      ADD COLUMN "experienceLevel" text,
      ADD COLUMN "difficulty" text,
      ADD COLUMN "track" text,
      ADD COLUMN "founderVideoUrl" text,
      ADD COLUMN "expectations" jsonb,
      ADD COLUMN "ctaText" text,
      ADD COLUMN "milestones" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN "insightMoments" jsonb NOT NULL DEFAULT '[]'
    `);
    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD CONSTRAINT "CHK_programme_duration_positive"
      CHECK ("durationDays" IS NULL OR "durationDays" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      ADD COLUMN "programmeId" text,
      ADD COLUMN "moduleId" text,
      ADD COLUMN "contentType" text,
      ADD COLUMN "dayNumber" integer,
      ADD COLUMN "orderWithinDay" integer,
      ADD COLUMN "dayType" text,
      ADD COLUMN "timeEstimateMinutes" integer,
      ADD COLUMN "publishSlot" boolean NOT NULL DEFAULT false,
      ADD COLUMN "postNumber" integer,
      ADD COLUMN "pausePrompt" jsonb,
      ADD COLUMN "outputDescription" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      ADD CONSTRAINT "CHK_programme_tasks_day_positive"
      CHECK ("dayNumber" IS NULL OR "dayNumber" > 0),
      ADD CONSTRAINT "CHK_programme_tasks_order_positive"
      CHECK ("orderWithinDay" IS NULL OR "orderWithinDay" > 0),
      ADD CONSTRAINT "CHK_programme_tasks_time_positive"
      CHECK ("timeEstimateMinutes" IS NULL OR "timeEstimateMinutes" > 0),
      ADD CONSTRAINT "CHK_programme_tasks_day_type"
      CHECK ("dayType" IS NULL OR "dayType" IN ('push', 'protect', 'recharge')),
      ADD CONSTRAINT "CHK_programme_tasks_content_type"
      CHECK ("contentType" IS NULL OR "contentType" IN ('video', 'photo', 'caption', 'story')),
      ADD CONSTRAINT "CHK_programme_tasks_post_positive"
      CHECK ("postNumber" IS NULL OR "postNumber" > 0),
      ADD CONSTRAINT "CHK_programme_tasks_publish_post"
      CHECK (
        ("publishSlot" = TRUE AND "postNumber" IS NOT NULL)
        OR ("publishSlot" = FALSE AND "postNumber" IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_tasks_programme_day_order"
      ON "programme_tasks" ("programmeId", "dayNumber", "orderWithinDay")
      WHERE "programmeId" IS NOT NULL
        AND "dayNumber" IS NOT NULL
        AND "orderWithinDay" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_tasks_programme_day_order"
      ON "programme_tasks" ("programmeId", "dayNumber", "orderWithinDay")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_tasks_module"
      ON "programme_tasks" ("moduleId")
    `);

    await queryRunner.query(`
      CREATE TABLE "programme_modules" (
        "sourceDocumentId" text NOT NULL,
        "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "mirroredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "slug" text NOT NULL,
        "title" text NOT NULL,
        "moduleOrder" integer NOT NULL,
        "programmeId" text NOT NULL,
        "lessonIds" text[] NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_programme_modules" PRIMARY KEY ("sourceDocumentId"),
        CONSTRAINT "CHK_programme_modules_order_positive"
          CHECK ("moduleOrder" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_modules_slug"
      ON "programme_modules" ("slug")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_modules_programme_order"
      ON "programme_modules" ("programmeId", "moduleOrder")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_programme_modules_programme_order"
      ON "programme_modules" ("programmeId", "moduleOrder")
    `);

    for (const table of ["programme_modules"]) {
      await queryRunner.query(`REVOKE ALL ON "${table}" FROM PUBLIC`);
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${MIRROR_WRITER_ROLE}"`,
      );
      await queryRunner.query(
        `GRANT SELECT ON "${table}" TO "${MIRROR_READER_ROLE}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_programme_modules_programme_order"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_programme_modules_programme_order"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_programme_modules_slug"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "programme_modules"`);

    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_publish_post",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_post_positive",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_day_type",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_content_type",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_time_positive",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_order_positive",
      DROP CONSTRAINT IF EXISTS "CHK_programme_tasks_day_positive"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_programme_tasks_module"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_programme_tasks_programme_day_order"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_programme_tasks_programme_day_order"`,
    );
    await queryRunner.query(`
      ALTER TABLE "programme_tasks"
      DROP COLUMN IF EXISTS "outputDescription",
      DROP COLUMN IF EXISTS "pausePrompt",
      DROP COLUMN IF EXISTS "postNumber",
      DROP COLUMN IF EXISTS "publishSlot",
      DROP COLUMN IF EXISTS "timeEstimateMinutes",
      DROP COLUMN IF EXISTS "dayType",
      DROP COLUMN IF EXISTS "orderWithinDay",
      DROP COLUMN IF EXISTS "dayNumber",
      DROP COLUMN IF EXISTS "contentType",
      DROP COLUMN IF EXISTS "moduleId",
      DROP COLUMN IF EXISTS "programmeId"
    `);

    await queryRunner.query(`
      ALTER TABLE "programme"
      DROP CONSTRAINT IF EXISTS "CHK_programme_duration_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme"
      DROP COLUMN IF EXISTS "insightMoments",
      DROP COLUMN IF EXISTS "milestones",
      DROP COLUMN IF EXISTS "ctaText",
      DROP COLUMN IF EXISTS "expectations",
      DROP COLUMN IF EXISTS "founderVideoUrl",
      DROP COLUMN IF EXISTS "track",
      DROP COLUMN IF EXISTS "difficulty",
      DROP COLUMN IF EXISTS "experienceLevel",
      DROP COLUMN IF EXISTS "durationDays"
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD COLUMN IF NOT EXISTS "pdfTemplateId" text
    `);
    await queryRunner.query(`
      UPDATE "studio_lessons"
      SET "pdfTemplateId" = "attachmentsIds"[1]
      WHERE "attachmentsIds" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      DROP COLUMN IF EXISTS "attachmentsIds"
    `);
  }
}
