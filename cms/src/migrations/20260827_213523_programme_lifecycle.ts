import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_programmes_lifecycle_status" AS ENUM('draft', 'live', 'retired', 'archived');
  CREATE TYPE "public"."enum__programmes_v_version_lifecycle_status" AS ENUM('draft', 'live', 'retired', 'archived');
  ALTER TABLE "programmes" ADD COLUMN "key" varchar;
  ALTER TABLE "programmes" ADD COLUMN "lifecycle_status" "enum_programmes_lifecycle_status" DEFAULT 'draft';
  ALTER TABLE "_programmes_v" ADD COLUMN "version_key" varchar;
  ALTER TABLE "_programmes_v" ADD COLUMN "version_lifecycle_status" "enum__programmes_v_version_lifecycle_status" DEFAULT 'draft';
  UPDATE "programmes"
    SET "key" = "slug",
        "lifecycle_status" = CASE
          WHEN "_status" = 'published' THEN 'live'::"enum_programmes_lifecycle_status"
          ELSE 'draft'::"enum_programmes_lifecycle_status"
        END;
  UPDATE "_programmes_v"
    SET "version_key" = "version_slug",
        "version_lifecycle_status" = CASE
          WHEN "version__status" = 'published' THEN 'live'::"enum__programmes_v_version_lifecycle_status"
          ELSE 'draft'::"enum__programmes_v_version_lifecycle_status"
        END;
  CREATE UNIQUE INDEX "programmes_key_idx" ON "programmes" USING btree ("key");
  CREATE INDEX "_programmes_v_version_version_key_idx" ON "_programmes_v" USING btree ("version_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "programmes_key_idx";
  DROP INDEX "_programmes_v_version_version_key_idx";
  ALTER TABLE "programmes" DROP COLUMN "key";
  ALTER TABLE "programmes" DROP COLUMN "lifecycle_status";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_key";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_lifecycle_status";
  DROP TYPE "public"."enum_programmes_lifecycle_status";
  DROP TYPE "public"."enum__programmes_v_version_lifecycle_status";`)
}
