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
// table goes through raw SQL in InstagramService. Index and constraint names
// match 1784730000000-PlatformConnections exactly.
//
// The unique key is (userId, tier), not (userId, platform, tier): the
// vocabulary's follower.milestone payload has no platform field, so a tier
// is crossed once per user, not once per platform. `platform` is audit only.
@Entity({ name: "follower_milestone" })
@Index("UQ_follower_milestone_user_tier", ["userId", "tier"], { unique: true })
@Check("CHK_follower_milestone_tier", `"tier" IN (100, 1000, 10000)`)
export class FollowerMilestoneEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_follower_milestone_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "platform" })
  platform!: string;

  @Column("integer", { name: "tier" })
  tier!: number;

  @Column("integer", { name: "followerCount" })
  followerCount!: number;

  @Column("timestamptz", { name: "reachedAt", default: () => "now()" })
  reachedAt!: Date;
}
