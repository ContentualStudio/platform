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
@Entity({ name: "follower_snapshot" })
@Index("UQ_follower_snapshot_day", ["userId", "platform", "localDate"], { unique: true })
@Check("CHK_follower_snapshot_count", `"followerCount" >= 0`)
export class FollowerSnapshotEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_follower_snapshot_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "platform" })
  platform!: string;

  @Column("date", { name: "localDate" })
  localDate!: string;

  @Column("integer", { name: "followerCount" })
  followerCount!: number;

  @Column("timestamptz", { name: "recordedAt", default: () => "now()" })
  recordedAt!: Date;
}
