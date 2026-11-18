import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_minimum_tier" AS ENUM('free', 'creator', 'pro');
  CREATE TYPE "public"."enum__lessons_v_version_minimum_tier" AS ENUM('free', 'creator', 'pro');
  ALTER TABLE "lessons" ADD COLUMN "minimum_tier" "enum_lessons_minimum_tier" DEFAULT 'free';
  ALTER TABLE "_lessons_v" ADD COLUMN "version_minimum_tier" "enum__lessons_v_version_minimum_tier" DEFAULT 'free';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons" DROP COLUMN "minimum_tier";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_minimum_tier";
  DROP TYPE "public"."enum_lessons_minimum_tier";
  DROP TYPE "public"."enum__lessons_v_version_minimum_tier";`)
}
