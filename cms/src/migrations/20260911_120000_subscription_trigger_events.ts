import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_engine_rules_trigger_event" ADD VALUE 'subscription.started';
  ALTER TYPE "public"."enum_engine_rules_trigger_event" ADD VALUE 'subscription.changed';
  ALTER TYPE "public"."enum_engine_rules_trigger_event" ADD VALUE 'subscription.ended';
  ALTER TYPE "public"."enum__engine_rules_v_version_trigger_event" ADD VALUE 'subscription.started';
  ALTER TYPE "public"."enum__engine_rules_v_version_trigger_event" ADD VALUE 'subscription.changed';
  ALTER TYPE "public"."enum__engine_rules_v_version_trigger_event" ADD VALUE 'subscription.ended';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rows using the new values cannot be cast back to the old enum.
  await db.execute(sql`
   DELETE FROM "engine_rules" WHERE "trigger_event"::text LIKE 'subscription.%';
  DELETE FROM "_engine_rules_v" WHERE "version_trigger_event"::text LIKE 'subscription.%';
  ALTER TABLE "engine_rules" ALTER COLUMN "trigger_event" SET DATA TYPE text;
  DROP TYPE "public"."enum_engine_rules_trigger_event";
  CREATE TYPE "public"."enum_engine_rules_trigger_event" AS ENUM('task.completed', 'task.skipped', 'programme.started', 'programme.completed', 'programme.count_reached', 'streak.reached', 'streak.broken', 'streak.resumed', 'week.completed', 'level.changed', 'platform.connected', 'follower.milestone');
  ALTER TABLE "engine_rules" ALTER COLUMN "trigger_event" SET DATA TYPE "public"."enum_engine_rules_trigger_event" USING "trigger_event"::"public"."enum_engine_rules_trigger_event";
  ALTER TABLE "_engine_rules_v" ALTER COLUMN "version_trigger_event" SET DATA TYPE text;
  DROP TYPE "public"."enum__engine_rules_v_version_trigger_event";
  CREATE TYPE "public"."enum__engine_rules_v_version_trigger_event" AS ENUM('task.completed', 'task.skipped', 'programme.started', 'programme.completed', 'programme.count_reached', 'streak.reached', 'streak.broken', 'streak.resumed', 'week.completed', 'level.changed', 'platform.connected', 'follower.milestone');
  ALTER TABLE "_engine_rules_v" ALTER COLUMN "version_trigger_event" SET DATA TYPE "public"."enum__engine_rules_v_version_trigger_event" USING "version_trigger_event"::"public"."enum__engine_rules_v_version_trigger_event";`)
}
