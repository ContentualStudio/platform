import {
  type MigrateUpArgs,
  type MigrateDownArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "engine_rules" ADD COLUMN "priority" numeric DEFAULT 100;
    ALTER TABLE "_engine_rules_v" ADD COLUMN "version_priority" numeric DEFAULT 100;
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_engine_rules_v" DROP COLUMN "version_priority";
    ALTER TABLE "engine_rules" DROP COLUMN "priority";
  `);
}
