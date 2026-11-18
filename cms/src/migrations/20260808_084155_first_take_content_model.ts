import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_programmes_experience_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum_programmes_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TYPE "public"."enum_programmes_track" AS ENUM('starter', 'grinder', 'pro', 'recovery', 'smb', 'keep_creating');
  CREATE TYPE "public"."enum__programmes_v_version_experience_level" AS ENUM('beginner', 'intermediate', 'advanced');
  CREATE TYPE "public"."enum__programmes_v_version_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TYPE "public"."enum__programmes_v_version_track" AS ENUM('starter', 'grinder', 'pro', 'recovery', 'smb', 'keep_creating');
  CREATE TYPE "public"."enum_programmes_insight_moments_trigger_type" AS ENUM('day', 'task_completed', 'week_completed', 'three_consecutive_skipped_days');
  CREATE TYPE "public"."enum__programmes_v_version_insight_moments_trigger_type" AS ENUM('day', 'task_completed', 'week_completed', 'three_consecutive_skipped_days');
  CREATE TYPE "public"."enum_modules_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__modules_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_tasks_day_type" AS ENUM('push', 'protect', 'recharge');
  CREATE TYPE "public"."enum__tasks_v_version_day_type" AS ENUM('push', 'protect', 'recharge');
  CREATE TYPE "public"."enum_tasks_content_type" AS ENUM('video', 'photo', 'caption', 'story');
  CREATE TYPE "public"."enum__tasks_v_version_content_type" AS ENUM('video', 'photo', 'caption', 'story');
  CREATE TABLE "lessons_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_lessons_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "programmes_milestones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"trigger_day" numeric,
  	"copy" jsonb
  );
  
  CREATE TABLE "programmes_insight_moments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"trigger_type" "enum_programmes_insight_moments_trigger_type",
  	"trigger_condition" varchar,
  	"copy" jsonb
  );
  
  CREATE TABLE "_programmes_v_version_milestones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"trigger_day" numeric,
  	"copy" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_programmes_v_version_insight_moments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"trigger_type" "enum__programmes_v_version_insight_moments_trigger_type",
  	"trigger_condition" varchar,
  	"copy" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "modules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"order" numeric,
  	"programme_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_modules_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "modules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"lessons_id" integer
  );
  
  CREATE TABLE "_modules_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_order" numeric,
  	"version_programme_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__modules_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_modules_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"lessons_id" integer
  );
  
  ALTER TABLE "lessons" DROP CONSTRAINT "lessons_pdf_template_id_media_id_fk";
  
  ALTER TABLE "_lessons_v" DROP CONSTRAINT "_lessons_v_version_pdf_template_id_media_id_fk";
  
  DROP INDEX "lessons_pdf_template_idx";
  DROP INDEX "_lessons_v_version_version_pdf_template_idx";
  ALTER TABLE "programmes" ADD COLUMN "duration_days" numeric;
  ALTER TABLE "programmes" ADD COLUMN "experience_level" "enum_programmes_experience_level";
  ALTER TABLE "programmes" ADD COLUMN "difficulty" "enum_programmes_difficulty";
  ALTER TABLE "programmes" ADD COLUMN "track" "enum_programmes_track";
  ALTER TABLE "programmes" ADD COLUMN "founder_video_url" varchar;
  ALTER TABLE "programmes" ADD COLUMN "expectations" jsonb;
  ALTER TABLE "programmes" ADD COLUMN "cta_text" varchar;
  ALTER TABLE "_programmes_v" ADD COLUMN "version_duration_days" numeric;
  ALTER TABLE "_programmes_v" ADD COLUMN "version_experience_level" "enum__programmes_v_version_experience_level";
  ALTER TABLE "_programmes_v" ADD COLUMN "version_difficulty" "enum__programmes_v_version_difficulty";
  ALTER TABLE "_programmes_v" ADD COLUMN "version_track" "enum__programmes_v_version_track";
  ALTER TABLE "_programmes_v" ADD COLUMN "version_founder_video_url" varchar;
  ALTER TABLE "_programmes_v" ADD COLUMN "version_expectations" jsonb;
  ALTER TABLE "_programmes_v" ADD COLUMN "version_cta_text" varchar;
  ALTER TABLE "tasks" ADD COLUMN "programme_id" integer;
  ALTER TABLE "tasks" ADD COLUMN "module_id" integer;
  ALTER TABLE "tasks" ADD COLUMN "content_type" "enum_tasks_content_type";
  ALTER TABLE "tasks" ADD COLUMN "day_number" numeric;
  ALTER TABLE "tasks" ADD COLUMN "order_within_day" numeric;
  ALTER TABLE "tasks" ADD COLUMN "day_type" "enum_tasks_day_type";
  ALTER TABLE "tasks" ADD COLUMN "time_estimate_minutes" numeric;
  ALTER TABLE "tasks" ADD COLUMN "publish_slot" boolean DEFAULT false;
  ALTER TABLE "tasks" ADD COLUMN "post_number" numeric;
  ALTER TABLE "tasks" ADD COLUMN "pause_prompt" jsonb;
  ALTER TABLE "tasks" ADD COLUMN "output_description" jsonb;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_programme_id" integer;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_module_id" integer;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_content_type" "enum__tasks_v_version_content_type";
  ALTER TABLE "_tasks_v" ADD COLUMN "version_day_number" numeric;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_order_within_day" numeric;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_day_type" "enum__tasks_v_version_day_type";
  ALTER TABLE "_tasks_v" ADD COLUMN "version_time_estimate_minutes" numeric;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_publish_slot" boolean DEFAULT false;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_post_number" numeric;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_pause_prompt" jsonb;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_output_description" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "modules_id" integer;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lessons_v_rels" ADD CONSTRAINT "_lessons_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_lessons_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lessons_v_rels" ADD CONSTRAINT "_lessons_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "programmes_milestones" ADD CONSTRAINT "programmes_milestones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "programmes_insight_moments" ADD CONSTRAINT "programmes_insight_moments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_programmes_v_version_milestones" ADD CONSTRAINT "_programmes_v_version_milestones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_programmes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_programmes_v_version_insight_moments" ADD CONSTRAINT "_programmes_v_version_insight_moments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_programmes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "modules" ADD CONSTRAINT "modules_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "modules_rels" ADD CONSTRAINT "modules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "modules_rels" ADD CONSTRAINT "modules_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_modules_v" ADD CONSTRAINT "_modules_v_parent_id_modules_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_modules_v" ADD CONSTRAINT "_modules_v_version_programme_id_programmes_id_fk" FOREIGN KEY ("version_programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_modules_v_rels" ADD CONSTRAINT "_modules_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_modules_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_modules_v_rels" ADD CONSTRAINT "_modules_v_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_rels_order_idx" ON "lessons_rels" USING btree ("order");
  CREATE INDEX "lessons_rels_parent_idx" ON "lessons_rels" USING btree ("parent_id");
  CREATE INDEX "lessons_rels_path_idx" ON "lessons_rels" USING btree ("path");
  CREATE INDEX "lessons_rels_media_id_idx" ON "lessons_rels" USING btree ("media_id");
  CREATE INDEX "_lessons_v_rels_order_idx" ON "_lessons_v_rels" USING btree ("order");
  CREATE INDEX "_lessons_v_rels_parent_idx" ON "_lessons_v_rels" USING btree ("parent_id");
  CREATE INDEX "_lessons_v_rels_path_idx" ON "_lessons_v_rels" USING btree ("path");
  CREATE INDEX "_lessons_v_rels_media_id_idx" ON "_lessons_v_rels" USING btree ("media_id");
  CREATE INDEX "programmes_milestones_order_idx" ON "programmes_milestones" USING btree ("_order");
  CREATE INDEX "programmes_milestones_parent_id_idx" ON "programmes_milestones" USING btree ("_parent_id");
  CREATE INDEX "programmes_insight_moments_order_idx" ON "programmes_insight_moments" USING btree ("_order");
  CREATE INDEX "programmes_insight_moments_parent_id_idx" ON "programmes_insight_moments" USING btree ("_parent_id");
  CREATE INDEX "_programmes_v_version_milestones_order_idx" ON "_programmes_v_version_milestones" USING btree ("_order");
  CREATE INDEX "_programmes_v_version_milestones_parent_id_idx" ON "_programmes_v_version_milestones" USING btree ("_parent_id");
  CREATE INDEX "_programmes_v_version_insight_moments_order_idx" ON "_programmes_v_version_insight_moments" USING btree ("_order");
  CREATE INDEX "_programmes_v_version_insight_moments_parent_id_idx" ON "_programmes_v_version_insight_moments" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "modules_slug_idx" ON "modules" USING btree ("slug");
  CREATE INDEX "modules_programme_idx" ON "modules" USING btree ("programme_id");
  CREATE INDEX "modules_updated_at_idx" ON "modules" USING btree ("updated_at");
  CREATE INDEX "modules_created_at_idx" ON "modules" USING btree ("created_at");
  CREATE INDEX "modules__status_idx" ON "modules" USING btree ("_status");
  CREATE INDEX "modules_rels_order_idx" ON "modules_rels" USING btree ("order");
  CREATE INDEX "modules_rels_parent_idx" ON "modules_rels" USING btree ("parent_id");
  CREATE INDEX "modules_rels_path_idx" ON "modules_rels" USING btree ("path");
  CREATE INDEX "modules_rels_lessons_id_idx" ON "modules_rels" USING btree ("lessons_id");
  CREATE INDEX "_modules_v_parent_idx" ON "_modules_v" USING btree ("parent_id");
  CREATE INDEX "_modules_v_version_version_slug_idx" ON "_modules_v" USING btree ("version_slug");
  CREATE INDEX "_modules_v_version_version_programme_idx" ON "_modules_v" USING btree ("version_programme_id");
  CREATE INDEX "_modules_v_version_version_updated_at_idx" ON "_modules_v" USING btree ("version_updated_at");
  CREATE INDEX "_modules_v_version_version_created_at_idx" ON "_modules_v" USING btree ("version_created_at");
  CREATE INDEX "_modules_v_version_version__status_idx" ON "_modules_v" USING btree ("version__status");
  CREATE INDEX "_modules_v_created_at_idx" ON "_modules_v" USING btree ("created_at");
  CREATE INDEX "_modules_v_updated_at_idx" ON "_modules_v" USING btree ("updated_at");
  CREATE INDEX "_modules_v_latest_idx" ON "_modules_v" USING btree ("latest");
  CREATE INDEX "_modules_v_autosave_idx" ON "_modules_v" USING btree ("autosave");
  CREATE INDEX "_modules_v_rels_order_idx" ON "_modules_v_rels" USING btree ("order");
  CREATE INDEX "_modules_v_rels_parent_idx" ON "_modules_v_rels" USING btree ("parent_id");
  CREATE INDEX "_modules_v_rels_path_idx" ON "_modules_v_rels" USING btree ("path");
  CREATE INDEX "_modules_v_rels_lessons_id_idx" ON "_modules_v_rels" USING btree ("lessons_id");
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_tasks_v" ADD CONSTRAINT "_tasks_v_version_programme_id_programmes_id_fk" FOREIGN KEY ("version_programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_tasks_v" ADD CONSTRAINT "_tasks_v_version_module_id_modules_id_fk" FOREIGN KEY ("version_module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_modules_fk" FOREIGN KEY ("modules_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tasks_programme_idx" ON "tasks" USING btree ("programme_id");
  CREATE INDEX "tasks_module_idx" ON "tasks" USING btree ("module_id");
  CREATE INDEX "_tasks_v_version_version_programme_idx" ON "_tasks_v" USING btree ("version_programme_id");
  CREATE INDEX "_tasks_v_version_version_module_idx" ON "_tasks_v" USING btree ("version_module_id");
  CREATE INDEX "payload_locked_documents_rels_modules_id_idx" ON "payload_locked_documents_rels" USING btree ("modules_id");
  INSERT INTO "lessons_rels" ("order", "parent_id", "path", "media_id")
  SELECT 0, "id", 'attachments', "pdf_template_id"
  FROM "lessons"
  WHERE "pdf_template_id" IS NOT NULL;
  INSERT INTO "_lessons_v_rels" ("order", "parent_id", "path", "media_id")
  SELECT 0, "id", 'attachments', "version_pdf_template_id"
  FROM "_lessons_v"
  WHERE "version_pdf_template_id" IS NOT NULL;
  ALTER TABLE "lessons" DROP COLUMN "pdf_template_id";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_pdf_template_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons" ADD COLUMN "pdf_template_id" integer;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_pdf_template_id" integer;
  UPDATE "lessons" AS lesson
  SET "pdf_template_id" = relation."media_id"
  FROM "lessons_rels" AS relation
  WHERE relation."parent_id" = lesson."id" AND relation."path" = 'attachments' AND relation."order" = 0;
  UPDATE "_lessons_v" AS version
  SET "version_pdf_template_id" = relation."media_id"
  FROM "_lessons_v_rels" AS relation
  WHERE relation."parent_id" = version."id" AND relation."path" = 'attachments' AND relation."order" = 0;
  ALTER TABLE "lessons_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lessons_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "programmes_milestones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "programmes_insight_moments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_programmes_v_version_milestones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_programmes_v_version_insight_moments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "modules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "modules_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_modules_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_modules_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks" DROP CONSTRAINT "tasks_programme_id_programmes_id_fk";
  ALTER TABLE "tasks" DROP CONSTRAINT "tasks_module_id_modules_id_fk";
  ALTER TABLE "_tasks_v" DROP CONSTRAINT "_tasks_v_version_programme_id_programmes_id_fk";
  ALTER TABLE "_tasks_v" DROP CONSTRAINT "_tasks_v_version_module_id_modules_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_modules_fk";
  DROP TABLE "lessons_rels" CASCADE;
  DROP TABLE "_lessons_v_rels" CASCADE;
  DROP TABLE "programmes_milestones" CASCADE;
  DROP TABLE "programmes_insight_moments" CASCADE;
  DROP TABLE "_programmes_v_version_milestones" CASCADE;
  DROP TABLE "_programmes_v_version_insight_moments" CASCADE;
  DROP TABLE "modules" CASCADE;
  DROP TABLE "modules_rels" CASCADE;
  DROP TABLE "_modules_v" CASCADE;
  DROP TABLE "_modules_v_rels" CASCADE;
  DROP INDEX "tasks_programme_idx";
  DROP INDEX "tasks_module_idx";
  DROP INDEX "_tasks_v_version_version_programme_idx";
  DROP INDEX "_tasks_v_version_version_module_idx";
  DROP INDEX "payload_locked_documents_rels_modules_id_idx";
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_pdf_template_id_media_id_fk" FOREIGN KEY ("pdf_template_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_lessons_v" ADD CONSTRAINT "_lessons_v_version_pdf_template_id_media_id_fk" FOREIGN KEY ("version_pdf_template_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_pdf_template_idx" ON "lessons" USING btree ("pdf_template_id");
  CREATE INDEX "_lessons_v_version_version_pdf_template_idx" ON "_lessons_v" USING btree ("version_pdf_template_id");
  ALTER TABLE "programmes" DROP COLUMN "duration_days";
  ALTER TABLE "programmes" DROP COLUMN "experience_level";
  ALTER TABLE "programmes" DROP COLUMN "difficulty";
  ALTER TABLE "programmes" DROP COLUMN "track";
  ALTER TABLE "programmes" DROP COLUMN "founder_video_url";
  ALTER TABLE "programmes" DROP COLUMN "expectations";
  ALTER TABLE "programmes" DROP COLUMN "cta_text";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_duration_days";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_experience_level";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_difficulty";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_track";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_founder_video_url";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_expectations";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_cta_text";
  ALTER TABLE "tasks" DROP COLUMN "programme_id";
  ALTER TABLE "tasks" DROP COLUMN "module_id";
  ALTER TABLE "tasks" DROP COLUMN "content_type";
  ALTER TABLE "tasks" DROP COLUMN "day_number";
  ALTER TABLE "tasks" DROP COLUMN "order_within_day";
  ALTER TABLE "tasks" DROP COLUMN "day_type";
  ALTER TABLE "tasks" DROP COLUMN "time_estimate_minutes";
  ALTER TABLE "tasks" DROP COLUMN "publish_slot";
  ALTER TABLE "tasks" DROP COLUMN "post_number";
  ALTER TABLE "tasks" DROP COLUMN "pause_prompt";
  ALTER TABLE "tasks" DROP COLUMN "output_description";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_programme_id";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_module_id";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_content_type";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_day_number";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_order_within_day";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_day_type";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_time_estimate_minutes";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_publish_slot";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_post_number";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_pause_prompt";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_output_description";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "modules_id";
  DROP TYPE "public"."enum_programmes_experience_level";
  DROP TYPE "public"."enum_programmes_difficulty";
  DROP TYPE "public"."enum_programmes_track";
  DROP TYPE "public"."enum__programmes_v_version_experience_level";
  DROP TYPE "public"."enum__programmes_v_version_difficulty";
  DROP TYPE "public"."enum__programmes_v_version_track";
  DROP TYPE "public"."enum_programmes_insight_moments_trigger_type";
  DROP TYPE "public"."enum__programmes_v_version_insight_moments_trigger_type";
  DROP TYPE "public"."enum_modules_status";
  DROP TYPE "public"."enum__modules_v_version_status";
  DROP TYPE "public"."enum_tasks_day_type";
  DROP TYPE "public"."enum__tasks_v_version_day_type";
  DROP TYPE "public"."enum_tasks_content_type";
  DROP TYPE "public"."enum__tasks_v_version_content_type";`)
}
