import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// A row is `reserved` while a holder runs the effect and `fired` once it
// completed. Named here so the service compares against these rather than
// retyping the literals; the SQL bodies and the CHECK constraint necessarily
// carry their own copies.
export const firingLedgerStatus = {
  reserved: "reserved",
  fired: "fired",
} as const;

export type FiringLedgerStatus =
  (typeof firingLedgerStatus)[keyof typeof firingLedgerStatus];

// One row per (rule, user, dedupe-scope key). Written only by
// FiringLedgerService's reservation path — no effect handler touches this table.
//
// Indexes and constraints are named to match 1784600000000-EngineFiringLedger
// exactly. Without the names, `migration:generate` treats them as new objects
// and emits a migration that drops the CHECK constraints — quietly removing the
// guarantees this table exists to enforce.
@Entity({ name: "engine_firing_ledger" })
@Index("UQ_engine_firing_ledger_rule_user_scope", ["ruleId", "userId", "scopeKey"], {
  unique: true,
})
@Index("IDX_engine_firing_ledger_user", ["userId"])
@Check(
  "CHK_engine_firing_ledger_status",
  `"status" IN ('reserved', 'fired')`,
)
@Check(
  "CHK_engine_firing_ledger_fired",
  `("status" = 'fired') = ("firedAt" IS NOT NULL)`,
)
export class EngineFiringLedgerEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "ruleId" })
  ruleId!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_engine_firing_ledger_user",
  })
  user!: BetterAuthUserEntity;

  // Namespaced: "user:*", "programme:<id>" or "event:<id>". See dedupe-scope-key.ts.
  @Column("text", { name: "scopeKey" })
  scopeKey!: string;

  // Audit only; the vocabulary package owns the token set.
  @Column("text", { name: "dedupeScope" })
  dedupeScope!: string;

  @Column("text", { name: "eventRef" })
  eventRef!: string;

  // "reserved" while a holder is running the effect, "fired" once the effect
  // completed. A fired row is never re-reservable.
  @Column("text", { name: "status", default: "reserved" })
  status!: FiringLedgerStatus;

  // Reissued on every lease takeover so a stale holder cannot mark a newer
  // holder's reservation fired.
  @Column("uuid", { name: "leaseToken" })
  leaseToken!: string;

  @Column("integer", { name: "attemptCount", default: 1 })
  attemptCount!: number;

  @Column("timestamptz", { name: "reservedAt", default: () => "now()" })
  reservedAt!: Date;

  @Column("timestamptz", { name: "firedAt", nullable: true })
  firedAt!: Date | null;
}
