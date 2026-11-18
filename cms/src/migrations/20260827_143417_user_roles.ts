import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hand-extended after generation, deliberately: the generated statement alone
// would give every existing account the 'editor' default, and since no account
// would hold 'admin' there would be nobody left able to grant the role — the
// current CMS team would be locked out of their own instance.
//
// Existing accounts already had unrestricted access, so promoting them to
// 'admin' preserves exactly what they could do yesterday rather than granting
// anything new. Tightening individual accounts afterwards is a deliberate act.
// New accounts get 'editor' from the column default.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'matching-operator', 'editor');
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'editor' NOT NULL;
  UPDATE "users" SET "role" = 'admin';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "role";
  DROP TYPE "public"."enum_users_role";`)
}
