import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

// A row is `pending` from the moment its owning fact transaction commits until
// an evaluator has accepted it. Named here so the dispatcher compares against
// these rather than retyping the literals; the SQL bodies and the CHECK
// constraint necessarily carry their own copies.
export const contentEventStatuses = {
  pending: "pending",
  delivered: "delivered",
} as const;

export type ContentEventStatus =
  (typeof contentEventStatuses)[keyof typeof contentEventStatuses];

// The Content Engine's transactional outbox. A write path inserts here inside
// the same transaction as the fact the event describes, so the two commit or
// roll back together; delivery to the evaluator is a separate, post-commit
// step that may fail and retry without touching the fact.
//
// `id` is the caller's stable event ID (e.g.
// "programme.started:<userId>:<programmeId>"), not a generated key — that is
// what makes a replayed request a no-op rather than a second event.
//
// Indexes and constraints are named to match
// 1784690000000-ContentEngineEvents exactly. Without the names,
// `migration:generate` treats them as new objects and emits a migration that
// drops them.
@Entity({ name: "content_engine_events" })
@Index("IDX_content_engine_events_pending", ["status", "availableAt"])
@Index("IDX_content_engine_events_name_created", ["eventName", "createdAt"])
@Check(
  "CHK_content_engine_events_status",
  `"status" IN ('pending', 'delivered')`,
)
export class ContentEngineEventEntity {
  @PrimaryColumn("text")
  id!: string;

  // Audit and routing only; @contentual/content-engine-vocabulary owns the
  // token set, and the emitter validates against it before any insert. There is
  // deliberately no CHECK constraint copying the twelve tokens here.
  @Column("text")
  eventName!: string;

  // Copied out of the validated payload so ownership and audit queries are
  // indexed rather than reaching into the jsonb.
  @Column("text")
  userId!: string;

  @Column("jsonb")
  payload!: Record<string, unknown>;

  @Column("text", { default: contentEventStatuses.pending })
  status!: ContentEventStatus;

  // Incremented by the claim, not by the outcome, so a dispatcher that crashes
  // mid-evaluation still burns an attempt and backs off.
  @Column("integer", { default: 0 })
  attemptCount!: number;

  @Column("timestamptz", { default: () => "now()" })
  availableAt!: Date;

  // Fencing token: reissued on every claim so a stale dispatcher finishing late
  // cannot mark a newer holder's claim delivered.
  @Column("uuid", { nullable: true })
  claimToken!: string | null;

  @Column("timestamptz", { nullable: true })
  claimedUntil!: Date | null;

  @Column("text", { nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @Column("timestamptz", { nullable: true })
  deliveredAt!: Date | null;
}
