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

export const taskProgressOutcomes = {
  completed: "completed",
  skipped: "skipped",
} as const;

export type TaskProgressOutcome =
  (typeof taskProgressOutcomes)[keyof typeof taskProgressOutcomes];

// Read-only schema mirror for `migration:generate` — every write to this
// table goes through raw SQL in ProgrammeTaskService, never through this
// entity's repository. Indexes and constraints are named to match
// 1784700000000-ProgrammeTaskProgress exactly, so a regenerated migration
// doesn't drop and recreate them as "new" objects.
@Entity({ name: "programme_task_progress" })
@Index("UQ_programme_task_progress_assignment_day", [
  "assignmentId",
  "taskId",
  "outcome",
  "localDate",
], { unique: true })
@Index("IDX_programme_task_progress_user_day", ["userId", "localDate"])
@Index("IDX_programme_task_progress_week", ["userId", "programmeId", "weekIndex"])
@Check("CHK_programme_task_progress_outcome", `"outcome" IN ('completed', 'skipped')`)
export class ProgrammeTaskProgressEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("uuid", { name: "assignmentId" })
  assignmentId!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_programme_task_progress_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "programmeId" })
  programmeId!: string;

  @Column("text", { name: "taskId" })
  taskId!: string;

  @Column("text", { name: "outcome" })
  outcome!: TaskProgressOutcome;

  // Denormalised at write time from the published programme_tasks mirror.
  @Column("integer", { name: "weekIndex" })
  weekIndex!: number;

  @Column("text", { name: "contentType" })
  contentType!: string;

  @Column("date", { name: "localDate" })
  localDate!: string;

  @Column("timestamptz", { name: "recordedAt", default: () => "now()" })
  recordedAt!: Date;
}
