import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_programmes_access" AS ENUM('open', 'locked');
  CREATE TYPE "public"."enum__programmes_v_version_access" AS ENUM('open', 'locked');
  ALTER TABLE "programmes" ADD COLUMN "access" "enum_programmes_access" DEFAULT 'open';
  ALTER TABLE "_programmes_v" ADD COLUMN "version_access" "enum__programmes_v_version_access" DEFAULT 'open';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "programmes" DROP COLUMN "access";
  ALTER TABLE "_programmes_v" DROP COLUMN "version_access";
  DROP TYPE "public"."enum_programmes_access";
  DROP TYPE "public"."enum__programmes_v_version_access";`)
}
