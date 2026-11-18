import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Stage 2 of onboarding: the challenge-setup questionnaire the user runs from
// the dashboard ("Get Started"). On completion the matcher assigns a
// programme; the Welcome Page then gates access to Day 1 until the user taps
// "Begin Programme". Kept as its own table so the stage 1 profile concern
// stays untouched.
@Entity({ name: "challenge_setup" })
export class ChallengeSetupEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  // ── Stage 2 answers ──
  @Column("text", { array: true, nullable: true })
  platforms!: string[] | null;

  @Column("text", { name: "primaryPlatform", nullable: true })
  primaryPlatform!: string | null;

  @Column("text", { name: "postingGoal", nullable: true })
  postingGoal!: string | null;

  @Column("integer", { name: "weeklyCommitment", nullable: true })
  weeklyCommitment!: number | null;

  @Column("text", { array: true, name: "availableDays", nullable: true })
  availableDays!: string[] | null;

  // Interstitial "tailored content" testimonial screen — persisted like any
  // other step so an abandoned session doesn't re-show it on resume.
  @Column("boolean", { name: "sawTestimonial", nullable: true })
  sawTestimonial!: boolean | null;

  @Column("text", { name: "nicheDefined", nullable: true })
  nicheDefined!: string | null;

  @Column("text", { name: "contentType", nullable: true })
  contentType!: string | null;

  @Column("text", { name: "followerRange", nullable: true })
  followerRange!: string | null;

  // Mock for now: `true` once the user taps "Connect Instagram". Real OAuth
  // will replace the write path later (see challenge-setup.controller).
  @Column("boolean", { name: "instagramConnected", nullable: true })
  instagramConnected!: boolean | null;

  @Column("text", { nullable: true })
  milestone!: string | null;

  // ── Assignment (produced by the matcher on questionnaire completion) ──
  @Column("timestamptz", { name: "setupCompletedAt", nullable: true })
  setupCompletedAt!: Date | null;

  // The immutable programme slug the matcher selected, already resolved
  // against published content: completion is only ever written after the slug
  // was found in the published programme mirror. Never rematched.
  @Column("text", { name: "assignedProgrammeId", nullable: true })
  assignedProgrammeId!: string | null;

  // The immutable content publication the assignment was made against. The
  // slug above remains as a stable display/routing key; it is never the source
  // for a new user's journey once this value is present.
  @Column("text", { name: "assignedProgrammeVersionId", nullable: true })
  assignedProgrammeVersionId!: string | null;

  @Column("uuid", { name: "assignedProgrammeAssignmentId", nullable: true })
  assignedProgrammeAssignmentId!: string | null;

  @Column("timestamptz", { name: "programmeAssignedAt", nullable: true })
  programmeAssignedAt!: Date | null;

  // Audit trail for the assignment above: the released algorithm version that
  // ran and the leaf of its tree that answered. Nullable because rows assigned
  // before the versioned tree shipped have no honest value — see
  // migrations/1784880000000-ProgrammeMatchAudit.
  @Column("text", { name: "matchAlgorithmVersion", nullable: true })
  matchAlgorithmVersion!: string | null;

  @Column("text", { name: "matchLeafId", nullable: true })
  matchLeafId!: string | null;

  // ── Begin Programme (the Welcome Page gate) ──
  // programmeStartedAt is the single source of truth for "programme begun":
  // onboarding-complete, task access, and the one-time gate all derive from
  // it, and it is the idempotency key for begin().
  @Column("timestamptz", { name: "programmeStartedAt", nullable: true })
  programmeStartedAt!: Date | null;

  @Column("timestamptz", { name: "day1ScheduledFor", nullable: true })
  day1ScheduledFor!: Date | null;

  // Read-model convenience only, written unconditionally after
  // ProgressionService's programme_completion gate — see that migration for
  // why this column cannot be the gate itself.
  @Column("timestamptz", { name: "programmeCompletedAt", nullable: true })
  programmeCompletedAt!: Date | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
