import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Read-only schema mirror for `migration:generate` — every write to this
// table goes through raw SQL in ProgrammeTaskService. Index name matches
// 1784700000000-ProgrammeTaskProgress exactly.
@Entity({ name: "programme_week_completion" })
@Index("UQ_programme_week_completion_assignment", ["assignmentId", "weekIndex"], {
  unique: true,
})
export class ProgrammeWeekCompletionEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("uuid", { name: "assignmentId" })
  assignmentId!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_programme_week_completion_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "programmeId" })
  programmeId!: string;

  @Column("integer", { name: "weekIndex" })
  weekIndex!: number;

  @Column("timestamptz", { name: "completedAt", default: () => "now()" })
  completedAt!: Date;
}
