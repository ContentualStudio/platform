import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Carry paid-only lessons over to the Creator gate before the flag goes.
  await db.execute(sql`
   UPDATE "lessons" SET "minimum_tier" = 'creator' WHERE "paid_only";
  UPDATE "_lessons_v" SET "version_minimum_tier" = 'creator' WHERE "version_paid_only";
  ALTER TABLE "lessons" DROP COLUMN "paid_only";
  ALTER TABLE "_lessons_v" DROP COLUMN "version_paid_only";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons" ADD COLUMN "paid_only" boolean DEFAULT false;
  ALTER TABLE "_lessons_v" ADD COLUMN "version_paid_only" boolean DEFAULT false;
  UPDATE "lessons" SET "paid_only" = true WHERE "minimum_tier" <> 'free';
  UPDATE "_lessons_v" SET "version_paid_only" = true WHERE "version_minimum_tier" <> 'free';`)
}
