import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { MatchingTrace } from "@contentual/programme-matching-vocabulary";
import { BetterAuthUserEntity } from "../../auth/entities";

/**
 * One row per decision, never edited.
 *
 * `challenge_setup` answers "does this user have a programme". This answers
 * "which programme, on which content version, under which rules, and why" —
 * and keeps answering it after the rules and the content have both moved on.
 * A rematch supersedes a row; it never rewrites one.
 */
@Entity({ name: "programme_assignment" })
export class ProgrammeAssignmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  // The assigned programme, pinned to the exact published content version the
  // rule targeted. Welcome, task delivery and progression read the version, so
  // a republish cannot move a live user mid-journey.
  @Column("text", { name: "programmeKey" })
  programmeKey!: string;

  @Column("text", { name: "programmeVersionId" })
  programmeVersionId!: string;

  // A caller-owned identity for one assignment attempt. Retrying the same
  // operator request must return this row rather than close/insert again.
  @Column("text", { name: "attemptId" })
  attemptId!: string;

  @Column("text", { name: "attemptActor" })
  attemptActor!: string;

  @Column("text", { name: "attemptReason" })
  attemptReason!: string;

  // The decision's provenance. Not foreign keys: an assignment must outlive
  // the purge of an old setup version, and a dangling identifier is still
  // honest history where a cascade delete would be silence.
  @Column("text", { name: "setupVersionId" })
  setupVersionId!: string;

  @Column("text", { name: "winningRuleId" })
  winningRuleId!: string;

  @Column("boolean", { name: "fallbackUsed" })
  fallbackUsed!: boolean;

  // Recorded even though only one rule can win. A rising overlap count is how
  // operators discover their priorities no longer say what they meant.
  @Column("boolean", { name: "multipleRulesQualified" })
  multipleRulesQualified!: boolean;

  // Exactly the structured answers the evaluator read — the matching profile,
  // nothing wider. Free text has no key in that shape, so it cannot appear
  // here even by mistake.
  @Column("jsonb", { name: "structuredAnswers" })
  structuredAnswers!: Record<string, unknown>;

  @Column("jsonb", { name: "trace" })
  trace!: MatchingTrace;

  @Column("timestamptz", { name: "matchedAt" })
  matchedAt!: Date;

  // A partial unique index enforces one active row per user, which is what
  // makes concurrent completion safe without relying on every call site
  // taking the right lock.
  @Column("boolean", { name: "active", default: true })
  active!: boolean;

  @Column("timestamptz", { name: "supersededAt", nullable: true })
  supersededAt!: Date | null;

  @Column("text", { name: "resetReason", nullable: true })
  resetReason!: string | null;

  @Column("text", { name: "resetActor", nullable: true })
  resetActor!: string | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;
}
