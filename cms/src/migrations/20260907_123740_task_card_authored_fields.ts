import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tasks_platform" AS ENUM('instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'pinterest');
  CREATE TYPE "public"."enum__tasks_v_version_platform" AS ENUM('instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'pinterest');
  ALTER TABLE "tasks" ADD COLUMN "platform" "enum_tasks_platform";
  ALTER TABLE "tasks" ADD COLUMN "camera_required" boolean DEFAULT false;
  ALTER TABLE "tasks" ADD COLUMN "objective" varchar;
  ALTER TABLE "tasks" ADD COLUMN "opening_line" varchar;
  ALTER TABLE "tasks" ADD COLUMN "why_it_matters" jsonb;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_platform" "enum__tasks_v_version_platform";
  ALTER TABLE "_tasks_v" ADD COLUMN "version_camera_required" boolean DEFAULT false;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_objective" varchar;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_opening_line" varchar;
  ALTER TABLE "_tasks_v" ADD COLUMN "version_why_it_matters" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tasks" DROP COLUMN "platform";
  ALTER TABLE "tasks" DROP COLUMN "camera_required";
  ALTER TABLE "tasks" DROP COLUMN "objective";
  ALTER TABLE "tasks" DROP COLUMN "opening_line";
  ALTER TABLE "tasks" DROP COLUMN "why_it_matters";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_platform";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_camera_required";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_objective";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_opening_line";
  ALTER TABLE "_tasks_v" DROP COLUMN "version_why_it_matters";
  DROP TYPE "public"."enum_tasks_platform";
  DROP TYPE "public"."enum__tasks_v_version_platform";`)
}
