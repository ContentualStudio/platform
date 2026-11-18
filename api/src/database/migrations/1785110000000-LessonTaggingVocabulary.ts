import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Closed tagging vocabulary for the Studio lesson library.
 *
 * Additive and nullable throughout — rows published before the CMS gate carry
 * no tag until the backfill reprojects them, so IS NULL is permitted and the
 * CMS publish validation (not the mirror) guarantees newly published rows are
 * complete. `platforms` and `programmeRelevance` follow `attachmentsIds` in
 * being NOT NULL with an empty-array default: "untagged" and "not yet
 * answered" mean the same thing to a filter reading the card.
 *
 * `templateMediaId` stores the CMS media id, not a URL: the sync reads
 * documents at depth 0, so a populated media relationship never reaches the
 * projection. The API resolves the download URL from the id, exactly as
 * `attachmentsIds` stores ids for the app to resolve.
 *
 * Grants are table-level (see 1784800000000-FirstTakeContentMirrors), so the
 * mirror writer and reader roles pick these columns up without a new GRANT.
 */
export class LessonTaggingVocabulary1785110000000
  implements MigrationInterface
{
  name = "LessonTaggingVocabulary1785110000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD COLUMN "lessonType" text,
      ADD COLUMN "skillLevel" text,
      ADD COLUMN "contentType" text,
      ADD COLUMN "platforms" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN "programmeRelevance" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN "programmeDayStart" integer,
      ADD COLUMN "programmeDayEnd" integer,
      ADD COLUMN "vimeoVideoId" text,
      ADD COLUMN "templateMediaId" text
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD CONSTRAINT "CHK_studio_lessons_lesson_type"
      CHECK ("lessonType" IS NULL OR "lessonType" IN ('article', 'video', 'masterclass', 'template')),
      ADD CONSTRAINT "CHK_studio_lessons_skill_level"
      CHECK ("skillLevel" IS NULL OR "skillLevel" IN ('beginner', 'intermediate', 'advanced')),
      ADD CONSTRAINT "CHK_studio_lessons_content_type"
      CHECK ("contentType" IS NULL OR "contentType" IN ('video', 'photo', 'caption', 'story')),
      ADD CONSTRAINT "CHK_studio_lessons_platforms"
      CHECK ("platforms" <@ ARRAY['instagram', 'youtube', 'tiktok', 'linkedin'])
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      DROP CONSTRAINT IF EXISTS "CHK_studio_lessons_platforms",
      DROP CONSTRAINT IF EXISTS "CHK_studio_lessons_content_type",
      DROP CONSTRAINT IF EXISTS "CHK_studio_lessons_skill_level",
      DROP CONSTRAINT IF EXISTS "CHK_studio_lessons_lesson_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      DROP COLUMN IF EXISTS "templateMediaId",
      DROP COLUMN IF EXISTS "vimeoVideoId",
      DROP COLUMN IF EXISTS "programmeDayEnd",
      DROP COLUMN IF EXISTS "programmeDayStart",
      DROP COLUMN IF EXISTS "programmeRelevance",
      DROP COLUMN IF EXISTS "platforms",
      DROP COLUMN IF EXISTS "contentType",
      DROP COLUMN IF EXISTS "skillLevel",
      DROP COLUMN IF EXISTS "lessonType"
    `);
  }
}
