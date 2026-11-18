import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_matching_setups_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__matching_setups_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "matching_setups" (
  "id" serial PRIMARY KEY NOT NULL,
  "label" varchar,
  "notes" varchar,
  "rules" jsonb DEFAULT '[]'::jsonb,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "_status" "enum_matching_setups_status" DEFAULT 'draft'
  );

  CREATE TABLE "_matching_setups_v" (
  "id" serial PRIMARY KEY NOT NULL,
  "parent_id" integer,
  "version_label" varchar,
  "version_notes" varchar,
  "version_rules" jsonb DEFAULT '[]'::jsonb,
  "version_updated_at" timestamp(3) with time zone,
  "version_created_at" timestamp(3) with time zone,
  "version__status" "enum__matching_setups_v_version_status" DEFAULT 'draft',
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "latest" boolean,
  "autosave" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "matching_setups_id" integer;
  ALTER TABLE "_matching_setups_v" ADD CONSTRAINT "_matching_setups_v_parent_id_matching_setups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."matching_setups"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matching_setups_updated_at_idx" ON "matching_setups" USING btree ("updated_at");
  CREATE INDEX "matching_setups_created_at_idx" ON "matching_setups" USING btree ("created_at");
  CREATE INDEX "matching_setups__status_idx" ON "matching_setups" USING btree ("_status");
  CREATE INDEX "_matching_setups_v_parent_idx" ON "_matching_setups_v" USING btree ("parent_id");
  CREATE INDEX "_matching_setups_v_version_version_updated_at_idx" ON "_matching_setups_v" USING btree ("version_updated_at");
  CREATE INDEX "_matching_setups_v_version_version_created_at_idx" ON "_matching_setups_v" USING btree ("version_created_at");
  CREATE INDEX "_matching_setups_v_version_version__status_idx" ON "_matching_setups_v" USING btree ("version__status");
  CREATE INDEX "_matching_setups_v_created_at_idx" ON "_matching_setups_v" USING btree ("created_at");
  CREATE INDEX "_matching_setups_v_updated_at_idx" ON "_matching_setups_v" USING btree ("updated_at");
  CREATE INDEX "_matching_setups_v_latest_idx" ON "_matching_setups_v" USING btree ("latest");
  CREATE INDEX "_matching_setups_v_autosave_idx" ON "_matching_setups_v" USING btree ("autosave");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matching_setups_fk" FOREIGN KEY ("matching_setups_id") REFERENCES "public"."matching_setups"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_matching_setups_id_idx" ON "payload_locked_documents_rels" USING btree ("matching_setups_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matching_setups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_matching_setups_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "matching_setups" CASCADE;
  DROP TABLE "_matching_setups_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_matching_setups_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_matching_setups_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "matching_setups_id";
  DROP TYPE "public"."enum_matching_setups_status";
  DROP TYPE "public"."enum__matching_setups_v_version_status";`);
}
