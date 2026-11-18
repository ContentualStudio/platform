import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

export const programmeEnrolmentStatuses = [
  "active",
  "completed",
  "abandoned",
] as const;

export type ProgrammeEnrolmentStatus =
  (typeof programmeEnrolmentStatuses)[number];

/**
 * One programme journey for one user. Active status is exclusive per user
 * (partial unique index in the migration). The day pointer is the next
 * programme day the 7am sweep should serve.
 */
@Entity({ name: "programme_enrolment" })
@Index("UQ_programme_enrolment_one_active_per_user", ["userId"], {
  unique: true,
  where: `"status" = 'active'`,
})
@Check(
  "CHK_programme_enrolment_status",
  `"status" IN ('active', 'completed', 'abandoned')`,
)
@Check("CHK_programme_enrolment_current_day", `"currentDay" > 0`)
@Check(
  "CHK_programme_enrolment_last_served_day",
  `"lastServedDay" IS NULL OR "lastServedDay" > 0`,
)
@Check("CHK_programme_enrolment_duration", `"durationDays" > 0`)
export class ProgrammeEnrolmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "programmeSlug" })
  programmeSlug!: string;

  @Column("text", { name: "programmeVersionId", nullable: true })
  programmeVersionId!: string | null;

  @Column("uuid", { name: "assignmentId", nullable: true })
  assignmentId!: string | null;

  @Column("text")
  status!: ProgrammeEnrolmentStatus;

  @Column("timestamptz", { name: "startedAt" })
  startedAt!: Date;

  /** Next programme day the sweep should attempt to serve. */
  @Column("integer", { name: "currentDay" })
  currentDay!: number;

  /** Most recently served programme day, if any. */
  @Column("integer", { name: "lastServedDay", nullable: true })
  lastServedDay!: number | null;

  @Column("integer", { name: "durationDays" })
  durationDays!: number;

  /** Local calendar date of the Day 1 anchor — first serve is not before this. */
  @Column("date", { name: "day1ScheduledFor" })
  day1ScheduledFor!: string;

  @Column("timestamptz", { name: "completedAt", nullable: true })
  completedAt!: Date | null;

  @Column("timestamptz", { name: "abandonedAt", nullable: true })
  abandonedAt!: Date | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
