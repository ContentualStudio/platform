import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Read-only schema mirror for `migration:generate` — every write to this
// table goes through raw SQL in GamificationService. Constraint names match
// 1784710000000-GamificationState exactly.
@Entity({ name: "user_streak" })
@Check("CHK_user_streak_current_length", `"currentLength" > 0`)
@Check("CHK_user_streak_longest_length", `"longestLength" > 0`)
@Check("CHK_user_streak_run_ordinal", `"runOrdinal" > 0`)
export class UserStreakEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_user_streak_user" })
  user!: BetterAuthUserEntity;

  @Column("date", { name: "lastActiveDate" })
  lastActiveDate!: string;

  @Column("date", { name: "runStartedDate" })
  runStartedDate!: string;

  @Column("integer", { name: "currentLength" })
  currentLength!: number;

  @Column("integer", { name: "longestLength" })
  longestLength!: number;

  // The discriminator that makes a length reached again, after a break, a
  // new event rather than a replay of the same stable ID.
  @Column("integer", { name: "runOrdinal", default: 1 })
  runOrdinal!: number;

  // NULL means this run's break, if any, has not been reported yet.
  @Column("timestamptz", { name: "brokenAt", nullable: true })
  brokenAt!: Date | null;

  @Column("timestamptz", { name: "updatedAt", default: () => "now()" })
  updatedAt!: Date;
}
