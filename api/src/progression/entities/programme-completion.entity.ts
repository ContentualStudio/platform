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

// Read-only schema mirror for `migration:generate` — every write to this
// table goes through raw SQL in ProgressionService. Index and constraint
// names match 1784720000000-ProgrammeCompletion exactly.
@Entity({ name: "programme_completion" })
@Index("UQ_programme_completion_assignment", ["assignmentId"], {
  unique: true,
})
@Index("UQ_programme_completion_user_ordinal", ["userId", "completionOrdinal"], {
  unique: true,
})
@Check("CHK_programme_completion_ordinal", `"completionOrdinal" > 0`)
export class ProgrammeCompletionEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("uuid", { name: "assignmentId" })
  assignmentId!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_programme_completion_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "programmeId" })
  programmeId!: string;

  @Column("text", { name: "programmeVersionId", nullable: true })
  programmeVersionId!: string | null;

  // Lifetime ordinal per user, minted by the gating insert.
  // programme.count_reached reports this value directly.
  @Column("integer", { name: "completionOrdinal" })
  completionOrdinal!: number;

  @Column("timestamptz", { name: "completedAt", default: () => "now()" })
  completedAt!: Date;
}
