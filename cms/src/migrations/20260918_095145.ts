import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_platforms" AS ENUM('instagram', 'youtube', 'tiktok', 'linkedin');
  CREATE TYPE "public"."enum_lessons_lesson_type" AS ENUM('article', 'video', 'masterclass', 'template');
  CREATE TYPE "public"."enum_lessons_skill_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum_lessons_content_type" AS ENUM('video', 'photo', 'caption', 'story');
  CREATE TYPE "public"."enum__lessons_v_version_platforms" AS ENUM('instagram', 'youtube', 'tiktok', 'linkedin');
  CREATE TYPE "public"."enum__lessons_v_version_lesson_type" AS ENUM('article', 'video', 'masterclass', 'template');
  CREATE TYPE "public"."enum__lessons_v_version_skill_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum__lessons_v_version_content_type" AS ENUM('video', 'photo', 'caption', 'story');
  CREATE TABLE "lessons_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_lessons_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_lessons_v_version_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__lessons_v_version_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "lessons" ADD COLUMN "lesson_type" "enum_lessons_lesson_type";
  ALTER TABLE "lessons" ADD COLUMN "skill_level" "enum_lessons_skill_level";
  ALTER TABLE "lessons" ADD COLUMN "content_type" "enum_lessons_content_type";
  ALTER TABLE "lessons" ADD COLUMN "programme_day_start" numeric;
  ALTER TABLE "lessons" ADD COLUMN "programme_day_end" numeric;
  ALTER TABLE "lessons" ADD COLUMN "vimeo_video_id" varchar;
  ALTER TABLE "lessons" ADD COLUMN "template_file_id" integer;
  ALTER TABLE "lessons_rels" ADD COLUMN "programmes_id" integer;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_lesson_type" "enum__lessons_v_version_lesson_type";
  ALTER TABLE "_lessons_v" ADD COLUMN "version_skill_level" "enum__lessons_v_version_skill_level";
  ALTER TABLE "_lessons_v" ADD COLUMN "version_content_type" "enum__lessons_v_version_content_type";
  ALTER TABLE "_lessons_v" ADD COLUMN "version_programme_day_start" numeric;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_programme_day_end" numeric;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_vimeo_video_id" varchar;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_template_file_id" integer;
  ALTER TABLE "_lessons_v_rels" ADD COLUMN "programmes_id" integer;
  ALTER TABLE "lessons_platforms" ADD CONSTRAINT "lessons_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lessons_v_version_platforms" ADD CONSTRAINT "_lessons_v_version_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_lessons_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_platforms_order_idx" ON "lessons_platforms" USING btree ("order");
  CREATE INDEX "lessons_platforms_parent_idx" ON "lessons_platforms" USING btree ("parent_id");
  CREATE INDEX "_lessons_v_version_platforms_order_idx" ON "_lessons_v_version_platforms" USING btree ("order");
  CREATE INDEX "_lessons_v_version_platforms_parent_idx" ON "_lessons_v_version_platforms" USING btree ("parent_id");
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_template_file_id_media_id_fk" FOREIGN KEY ("template_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_programmes_fk" FOREIGN KEY ("programmes_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lessons_v" ADD CONSTRAINT "_lessons_v_version_template_file_id_media_id_fk" FOREIGN KEY ("version_template_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_lessons_v_rels" ADD CONSTRAINT "_lessons_v_rels_programmes_fk" FOREIGN KEY ("programmes_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_template_file_idx" ON "lessons" USING btree ("template_file_id");
  CREATE INDEX "lessons_rels_programmes_id_idx" ON "lessons_rels" USING btree ("programmes_id");
  CREATE INDEX "_lessons_v_version_version_template_file_idx" ON "_lessons_v" USING btree ("version_template_file_id");
  CREATE INDEX "_lessons_v_rels_programmes_id_idx" ON "_lessons_v_rels" USING btree ("programmes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lessons_v_version_platforms" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "lessons_platforms" CASCADE;
  DROP TABLE "_lessons_v_version_platforms" CASCADE;
  ALTER TABLE "lessons" DROP CONSTRAINT "lessons_template_file_id_media_id_fk";
  
  ALTER TABLE "lessons_rels" DROP CONSTRAINT "lessons_rels_programmes_fk";
  
  ALTER TABLE "_lessons_v" DROP CONSTRAINT "_lessons_v_version_template_file_id_media_id_fk";
  
  ALTER TABLE "_lessons_v_rels" DROP CONSTRAINT "_lessons_v_rels_programmes_fk";
  
  DROP INDEX "lessons_template_file_idx";
  DROP INDEX "lessons_rels_programmes_id_idx";
  DROP INDEX "_lessons_v_version_version_template_file_idx";
  DROP INDEX "_lessons_v_rels_programmes_id_idx";
  ALTER TABLE "lessons" DROP COLUMN "lesson_type";
  ALTER TABLE "lessons" DROP COLUMN "skill_level";
  ALTER TABLE "lessons" DROP COLUMN "content_type";
  ALTER TABLE "lessons" DROP COLUMN "programme_day_start";
  ALTER TABLE "lessons" DROP COLUMN "programme_day_end";
  ALTER TABLE "lessons" DROP COLUMN "vimeo_video_id";
  ALTER TABLE "lessons" DROP COLUMN "template_file_id";
  ALTER TABLE "lessons_rels" DROP COLUMN "programmes_id";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_lesson_type";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_skill_level";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_content_type";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_programme_day_start";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_programme_day_end";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_vimeo_video_id";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_template_file_id";
  ALTER TABLE "_lessons_v_rels" DROP COLUMN "programmes_id";
  DROP TYPE "public"."enum_lessons_platforms";
  DROP TYPE "public"."enum_lessons_lesson_type";
  DROP TYPE "public"."enum_lessons_skill_level";
  DROP TYPE "public"."enum_lessons_content_type";
  DROP TYPE "public"."enum__lessons_v_version_platforms";
  DROP TYPE "public"."enum__lessons_v_version_lesson_type";
  DROP TYPE "public"."enum__lessons_v_version_skill_level";
  DROP TYPE "public"."enum__lessons_v_version_content_type";`)
}
