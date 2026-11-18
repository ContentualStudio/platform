import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Replaces the placeholder engine_rules JSON blob with typed authoring fields and
// adds the two effect-target catalogues.
//
// The placeholder column is dropped at the end of `up` and restored at the start
// of `down`: the generator cannot diff an add-and-drop on one table without
// asking whether it is a rename, so the two halves were generated separately and
// merged here. They must stay in one migration — Payload rolls a batch back
// oldest-first, so as separate migrations the down path would try to alter a
// column that no longer exists.
//
// The down path's constraint and index drops are `IF EXISTS`: dropping the
// catalogue tables with CASCADE already removes the foreign keys that reference
// them, and the generated statements would otherwise fail on the second half of
// their own rollback.

// `rules` held free-form JSON with no counterpart in the typed columns, so there
// is no conversion this migration could perform. Rather than discard authored
// content, it refuses to run while any rule — published or in version history —
// still carries a value. An operator who hits this must export or clear those
// rows deliberately.
async function assertNoAuthoredPlaceholderRules(
  db: MigrateUpArgs['db'],
): Promise<void> {
  const occupied: string[] = []

  for (const [table, column] of [
    ['engine_rules', 'rules'],
    ['_engine_rules_v', 'version_rules'],
  ]) {
    const result = await db.execute(sql.raw(`
      SELECT count(*)::int AS count
      FROM "${table}"
      WHERE "${column}" IS NOT NULL AND "${column}"::text NOT IN ('{}', 'null')
    `))
    const rows = (Array.isArray(result) ? result : result.rows) as {
      count: number
    }[]
    const count = Number(rows?.[0]?.count ?? 0)

    if (count > 0) {
      occupied.push(`${table}.${column} (${count} row(s))`)
    }
  }

  if (occupied.length > 0) {
    throw new Error(
      `Refusing to drop the placeholder engine rule content: ${occupied.join(
        ', ',
      )} still hold authored JSON. Export or clear these rows, then re-run the migration.`,
    )
  }
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await assertNoAuthoredPlaceholderRules(db)

  await db.execute(sql`
   CREATE TYPE "public"."enum_engine_badges_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__engine_badges_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_engine_call_types_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__engine_call_types_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_engine_rules_trigger_event" AS ENUM('task.completed', 'task.skipped', 'programme.started', 'programme.completed', 'programme.count_reached', 'streak.reached', 'streak.broken', 'streak.resumed', 'week.completed', 'level.changed', 'platform.connected', 'follower.milestone');
  CREATE TYPE "public"."enum_engine_rules_effect_type" AS ENUM('suggest_programme', 'unlock_programme', 'prompt_call', 'award_badge', 'in-app-message');
  CREATE TYPE "public"."enum_engine_rules_dedupe_scope" AS ENUM('once_per_user', 'once_per_user_per_programme', 'every_time');
  CREATE TYPE "public"."enum__engine_rules_v_version_trigger_event" AS ENUM('task.completed', 'task.skipped', 'programme.started', 'programme.completed', 'programme.count_reached', 'streak.reached', 'streak.broken', 'streak.resumed', 'week.completed', 'level.changed', 'platform.connected', 'follower.milestone');
  CREATE TYPE "public"."enum__engine_rules_v_version_effect_type" AS ENUM('suggest_programme', 'unlock_programme', 'prompt_call', 'award_badge', 'in-app-message');
  CREATE TYPE "public"."enum__engine_rules_v_version_dedupe_scope" AS ENUM('once_per_user', 'once_per_user_per_programme', 'every_time');
  CREATE TABLE "engine_badges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"description" varchar,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_engine_badges_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_engine_badges_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_key" varchar,
  	"version_description" varchar,
  	"version_active" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__engine_badges_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "engine_call_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"description" varchar,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_engine_call_types_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_engine_call_types_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_key" varchar,
  	"version_description" varchar,
  	"version_active" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__engine_call_types_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  ALTER TABLE "engine_rules" ALTER COLUMN "rules" DROP DEFAULT;
  ALTER TABLE "_engine_rules_v" ALTER COLUMN "version_rules" DROP DEFAULT;
  ALTER TABLE "engine_rules" ADD COLUMN "trigger_event" "enum_engine_rules_trigger_event";
  ALTER TABLE "engine_rules" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "engine_rules" ADD COLUMN "effect_type" "enum_engine_rules_effect_type";
  ALTER TABLE "engine_rules" ADD COLUMN "programme_id" integer;
  ALTER TABLE "engine_rules" ADD COLUMN "badge_id" integer;
  ALTER TABLE "engine_rules" ADD COLUMN "call_type_id" integer;
  ALTER TABLE "engine_rules" ADD COLUMN "message" varchar;
  ALTER TABLE "engine_rules" ADD COLUMN "dedupe_scope" "enum_engine_rules_dedupe_scope";
  ALTER TABLE "engine_rules" ADD COLUMN "active" boolean DEFAULT false;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_trigger_event" "enum__engine_rules_v_version_trigger_event";
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_conditions" jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_effect_type" "enum__engine_rules_v_version_effect_type";
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_programme_id" integer;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_badge_id" integer;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_call_type_id" integer;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_message" varchar;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_dedupe_scope" "enum__engine_rules_v_version_dedupe_scope";
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_active" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "engine_badges_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "engine_call_types_id" integer;
  ALTER TABLE "_engine_badges_v" ADD CONSTRAINT "_engine_badges_v_parent_id_engine_badges_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."engine_badges"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_engine_call_types_v" ADD CONSTRAINT "_engine_call_types_v_parent_id_engine_call_types_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."engine_call_types"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "engine_badges_key_idx" ON "engine_badges" USING btree ("key");
  CREATE INDEX "engine_badges_updated_at_idx" ON "engine_badges" USING btree ("updated_at");
  CREATE INDEX "engine_badges_created_at_idx" ON "engine_badges" USING btree ("created_at");
  CREATE INDEX "engine_badges__status_idx" ON "engine_badges" USING btree ("_status");
  CREATE INDEX "_engine_badges_v_parent_idx" ON "_engine_badges_v" USING btree ("parent_id");
  CREATE INDEX "_engine_badges_v_version_version_key_idx" ON "_engine_badges_v" USING btree ("version_key");
  CREATE INDEX "_engine_badges_v_version_version_updated_at_idx" ON "_engine_badges_v" USING btree ("version_updated_at");
  CREATE INDEX "_engine_badges_v_version_version_created_at_idx" ON "_engine_badges_v" USING btree ("version_created_at");
  CREATE INDEX "_engine_badges_v_version_version__status_idx" ON "_engine_badges_v" USING btree ("version__status");
  CREATE INDEX "_engine_badges_v_created_at_idx" ON "_engine_badges_v" USING btree ("created_at");
  CREATE INDEX "_engine_badges_v_updated_at_idx" ON "_engine_badges_v" USING btree ("updated_at");
  CREATE INDEX "_engine_badges_v_latest_idx" ON "_engine_badges_v" USING btree ("latest");
  CREATE INDEX "_engine_badges_v_autosave_idx" ON "_engine_badges_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "engine_call_types_key_idx" ON "engine_call_types" USING btree ("key");
  CREATE INDEX "engine_call_types_updated_at_idx" ON "engine_call_types" USING btree ("updated_at");
  CREATE INDEX "engine_call_types_created_at_idx" ON "engine_call_types" USING btree ("created_at");
  CREATE INDEX "engine_call_types__status_idx" ON "engine_call_types" USING btree ("_status");
  CREATE INDEX "_engine_call_types_v_parent_idx" ON "_engine_call_types_v" USING btree ("parent_id");
  CREATE INDEX "_engine_call_types_v_version_version_key_idx" ON "_engine_call_types_v" USING btree ("version_key");
  CREATE INDEX "_engine_call_types_v_version_version_updated_at_idx" ON "_engine_call_types_v" USING btree ("version_updated_at");
  CREATE INDEX "_engine_call_types_v_version_version_created_at_idx" ON "_engine_call_types_v" USING btree ("version_created_at");
  CREATE INDEX "_engine_call_types_v_version_version__status_idx" ON "_engine_call_types_v" USING btree ("version__status");
  CREATE INDEX "_engine_call_types_v_created_at_idx" ON "_engine_call_types_v" USING btree ("created_at");
  CREATE INDEX "_engine_call_types_v_updated_at_idx" ON "_engine_call_types_v" USING btree ("updated_at");
  CREATE INDEX "_engine_call_types_v_latest_idx" ON "_engine_call_types_v" USING btree ("latest");
  CREATE INDEX "_engine_call_types_v_autosave_idx" ON "_engine_call_types_v" USING btree ("autosave");
  ALTER TABLE "engine_rules" ADD CONSTRAINT "engine_rules_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "engine_rules" ADD CONSTRAINT "engine_rules_badge_id_engine_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."engine_badges"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "engine_rules" ADD CONSTRAINT "engine_rules_call_type_id_engine_call_types_id_fk" FOREIGN KEY ("call_type_id") REFERENCES "public"."engine_call_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_engine_rules_v" ADD CONSTRAINT "_engine_rules_v_version_programme_id_programmes_id_fk" FOREIGN KEY ("version_programme_id") REFERENCES "public"."programmes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_engine_rules_v" ADD CONSTRAINT "_engine_rules_v_version_badge_id_engine_badges_id_fk" FOREIGN KEY ("version_badge_id") REFERENCES "public"."engine_badges"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_engine_rules_v" ADD CONSTRAINT "_engine_rules_v_version_call_type_id_engine_call_types_id_fk" FOREIGN KEY ("version_call_type_id") REFERENCES "public"."engine_call_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_engine_badges_fk" FOREIGN KEY ("engine_badges_id") REFERENCES "public"."engine_badges"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_engine_call_types_fk" FOREIGN KEY ("engine_call_types_id") REFERENCES "public"."engine_call_types"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "engine_rules_programme_idx" ON "engine_rules" USING btree ("programme_id");
  CREATE INDEX "engine_rules_badge_idx" ON "engine_rules" USING btree ("badge_id");
  CREATE INDEX "engine_rules_call_type_idx" ON "engine_rules" USING btree ("call_type_id");
  CREATE INDEX "_engine_rules_v_version_version_programme_idx" ON "_engine_rules_v" USING btree ("version_programme_id");
  CREATE INDEX "_engine_rules_v_version_version_badge_idx" ON "_engine_rules_v" USING btree ("version_badge_id");
  CREATE INDEX "_engine_rules_v_version_version_call_type_idx" ON "_engine_rules_v" USING btree ("version_call_type_id");
  CREATE INDEX "payload_locked_documents_rels_engine_badges_id_idx" ON "payload_locked_documents_rels" USING btree ("engine_badges_id");
  CREATE INDEX "payload_locked_documents_rels_engine_call_types_id_idx" ON "payload_locked_documents_rels" USING btree ("engine_call_types_id");`)

  await db.execute(sql`
   ALTER TABLE "engine_rules" DROP COLUMN "rules";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_rules";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "engine_rules" ADD COLUMN "rules" jsonb;
  ALTER TABLE "_engine_rules_v" ADD COLUMN "version_rules" jsonb;`)

  await db.execute(sql`
   ALTER TABLE "engine_badges" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_engine_badges_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "engine_call_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_engine_call_types_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "engine_badges" CASCADE;
  DROP TABLE "_engine_badges_v" CASCADE;
  DROP TABLE "engine_call_types" CASCADE;
  DROP TABLE "_engine_call_types_v" CASCADE;
  ALTER TABLE "engine_rules" DROP CONSTRAINT IF EXISTS "engine_rules_programme_id_programmes_id_fk";
  
  ALTER TABLE "engine_rules" DROP CONSTRAINT IF EXISTS "engine_rules_badge_id_engine_badges_id_fk";
  
  ALTER TABLE "engine_rules" DROP CONSTRAINT IF EXISTS "engine_rules_call_type_id_engine_call_types_id_fk";
  
  ALTER TABLE "_engine_rules_v" DROP CONSTRAINT IF EXISTS "_engine_rules_v_version_programme_id_programmes_id_fk";
  
  ALTER TABLE "_engine_rules_v" DROP CONSTRAINT IF EXISTS "_engine_rules_v_version_badge_id_engine_badges_id_fk";
  
  ALTER TABLE "_engine_rules_v" DROP CONSTRAINT IF EXISTS "_engine_rules_v_version_call_type_id_engine_call_types_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_engine_badges_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_engine_call_types_fk";
  
  DROP INDEX IF EXISTS "engine_rules_programme_idx";
  DROP INDEX IF EXISTS "engine_rules_badge_idx";
  DROP INDEX IF EXISTS "engine_rules_call_type_idx";
  DROP INDEX IF EXISTS "_engine_rules_v_version_version_programme_idx";
  DROP INDEX IF EXISTS "_engine_rules_v_version_version_badge_idx";
  DROP INDEX IF EXISTS "_engine_rules_v_version_version_call_type_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_engine_badges_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_engine_call_types_id_idx";
  ALTER TABLE "engine_rules" ALTER COLUMN "rules" SET DEFAULT '{}'::jsonb;
  ALTER TABLE "_engine_rules_v" ALTER COLUMN "version_rules" SET DEFAULT '{}'::jsonb;
  ALTER TABLE "engine_rules" DROP COLUMN "trigger_event";
  ALTER TABLE "engine_rules" DROP COLUMN "conditions";
  ALTER TABLE "engine_rules" DROP COLUMN "effect_type";
  ALTER TABLE "engine_rules" DROP COLUMN "programme_id";
  ALTER TABLE "engine_rules" DROP COLUMN "badge_id";
  ALTER TABLE "engine_rules" DROP COLUMN "call_type_id";
  ALTER TABLE "engine_rules" DROP COLUMN "message";
  ALTER TABLE "engine_rules" DROP COLUMN "dedupe_scope";
  ALTER TABLE "engine_rules" DROP COLUMN "active";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_trigger_event";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_conditions";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_effect_type";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_programme_id";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_badge_id";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_call_type_id";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_message";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_dedupe_scope";
  ALTER TABLE "_engine_rules_v" DROP COLUMN "version_active";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "engine_badges_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "engine_call_types_id";
  DROP TYPE "public"."enum_engine_badges_status";
  DROP TYPE "public"."enum__engine_badges_v_version_status";
  DROP TYPE "public"."enum_engine_call_types_status";
  DROP TYPE "public"."enum__engine_call_types_v_version_status";
  DROP TYPE "public"."enum_engine_rules_trigger_event";
  DROP TYPE "public"."enum_engine_rules_effect_type";
  DROP TYPE "public"."enum_engine_rules_dedupe_scope";
  DROP TYPE "public"."enum__engine_rules_v_version_trigger_event";
  DROP TYPE "public"."enum__engine_rules_v_version_effect_type";
  DROP TYPE "public"."enum__engine_rules_v_version_dedupe_scope";`)
}
