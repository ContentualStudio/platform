import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Read-only schema mirror for `migration:generate` — every write to this
// table goes through raw SQL in GamificationService. No CHECK constraint
// restating the five level names — @contentual/content-engine-vocabulary
// owns that token set. Constraint name matches
// 1784710000000-GamificationState exactly.
@Entity({ name: "user_level" })
@Check("CHK_user_level_change_ordinal", `"changeOrdinal" >= 0`)
export class UserLevelEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_user_level_user" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "level" })
  level!: string;

  // The whole emit-once predicate for level.changed and the discriminator
  // in its stable ID.
  @Column("integer", { name: "changeOrdinal", default: 0 })
  changeOrdinal!: number;

  @Column("timestamptz", { name: "updatedAt", default: () => "now()" })
  updatedAt!: Date;
}
