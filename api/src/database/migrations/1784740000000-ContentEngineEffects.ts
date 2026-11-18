import { MigrationInterface, QueryRunner } from "typeorm";

// The per-user records the five v1 effect handlers write. Each is the durable
// trace of a rule firing; the feature modules that surface them (Progression,
// Gamification, Coaching Calls, Notifications) read these tables and own no
// write path into them.
//
// Target ids are the mirror's "sourceDocumentId" values, stored as plain text
// with no foreign key. The mirrors synchronise from the CMS independently of
// these writes, so an FK would make a rule firing fail because a mirror row had
// not landed yet. Handlers validate their target at execution time instead —
// the same rule the mirror tables themselves follow.
const EFFECT_TABLES = [
  "engine_programme_suggestion",
  "engine_programme_unlock",
  "engine_call_prompt",
  "engine_in_app_message",
  "user_achievement",
  "badge_cooldown_queue",
];

// Every effect row records which rule and which event produced it. Without that
// provenance an unexpected badge is untraceable: there is no way back from the
// user's achievement to the rule that awarded it.
const provenanceColumns = `
  "ruleId" text NOT NULL,
  "eventId" text NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
`;

function userColumn(table: string): string {
  return `
    "id" bigserial NOT NULL,
    "userId" text NOT NULL,
    CONSTRAINT "PK_${table}" PRIMARY KEY ("id"),
    CONSTRAINT "FK_${table}_user" FOREIGN KEY ("userId")
      REFERENCES "user" ("id") ON DELETE CASCADE
  `;
}

export class ContentEngineEffects1784740000000 implements MigrationInterface {
  name = "ContentEngineEffects1784740000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Suggestions accumulate. Choosing a single winner among competing
    // suggestions is Progression's job, and it needs to see all of them.
    await queryRunner.query(`
      CREATE TABLE "engine_programme_suggestion" (
        ${userColumn("engine_programme_suggestion")},
        "programmeId" text NOT NULL,
        ${provenanceColumns}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_programme_suggestion_user"
      ON "engine_programme_suggestion" ("userId", "createdAt")
    `);

    // An unlock grants access; it never enrolls. Enrolment stays an explicit
    // user action in Progression.
    await queryRunner.query(`
      CREATE TABLE "engine_programme_unlock" (
        ${userColumn("engine_programme_unlock")},
        "programmeId" text NOT NULL,
        ${provenanceColumns}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_programme_unlock_user"
      ON "engine_programme_unlock" ("userId", "programmeId")
    `);

    await queryRunner.query(`
      CREATE TABLE "engine_call_prompt" (
        ${userColumn("engine_call_prompt")},
        "callTypeId" text NOT NULL,
        ${provenanceColumns}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_call_prompt_user"
      ON "engine_call_prompt" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "engine_in_app_message" (
        ${userColumn("engine_in_app_message")},
        "message" text NOT NULL,
        ${provenanceColumns}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_engine_in_app_message_user"
      ON "engine_in_app_message" ("userId", "createdAt")
    `);

    // The second guard behind the firing ledger. The ledger already stops a
    // replayed event from re-running the effect; this unique index also stops
    // two *different* rules awarding the same badge from duplicating it, which
    // the ledger cannot see because it keys on the rule.
    await queryRunner.query(`
      CREATE TABLE "user_achievement" (
        ${userColumn("user_achievement")},
        "badgeId" text NOT NULL,
        ${provenanceColumns}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_achievement_user_badge"
      ON "user_achievement" ("userId", "badgeId")
    `);

    // Shape defined by the Gamification cooldown-queue ticket, which owns the
    // processor that drains it. Only the enqueue side is written here: awarding
    // a badge queues a celebration, it never fires one.
    await queryRunner.query(`
      CREATE TABLE "badge_cooldown_queue" (
        ${userColumn("badge_cooldown_queue")},
        "badgeId" text NOT NULL,
        "status" text NOT NULL DEFAULT 'queued',
        "enqueuedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "releasedAt" TIMESTAMP WITH TIME ZONE,
        ${provenanceColumns},
        CONSTRAINT "CHK_badge_cooldown_queue_status"
          CHECK ("status" IN ('queued', 'released', 'suppressed'))
      )
    `);
    // The processor's read: this user's queued rows, oldest first, so a backlog
    // drains in enqueue order.
    await queryRunner.query(`
      CREATE INDEX "IDX_badge_cooldown_queue_pending"
      ON "badge_cooldown_queue" ("userId", "status", "enqueuedAt")
    `);
    // A badge is enqueued once per user. The award path only enqueues when its
    // achievement insert actually inserted, so this backs that up rather than
    // being the primary guard.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_badge_cooldown_queue_user_badge"
      ON "badge_cooldown_queue" ("userId", "badgeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...EFFECT_TABLES].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
