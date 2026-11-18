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

// Read-only schema mirror for `migration:generate`. Names match
// 1784900000000-InstagramMetrics exactly.
@Entity({ name: "instagram_post_metric" })
@Index("UQ_instagram_post_metric_day", ["userId", "mediaId", "localDate"], {
  unique: true,
})
@Index("IDX_instagram_post_metric_recent", ["userId", "localDate", "postedAt"])
@Check(
  "CHK_instagram_post_metric_nonneg",
  `COALESCE("views", 0) >= 0 AND COALESCE("reach", 0) >= 0 AND COALESCE("likes", 0) >= 0 AND COALESCE("comments", 0) >= 0 AND COALESCE("shares", 0) >= 0 AND COALESCE("saved", 0) >= 0`,
)
export class InstagramPostMetricEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_instagram_post_metric_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "mediaId" })
  mediaId!: string;

  // The day the reading was taken, not the day the post was published.
  @Column("date", { name: "localDate" })
  localDate!: string;

  @Column("text", { name: "mediaType", nullable: true })
  mediaType!: string | null;

  @Column("text", { name: "permalink", nullable: true })
  permalink!: string | null;

  @Column("timestamptz", { name: "postedAt", nullable: true })
  postedAt!: Date | null;

  @Column("integer", { name: "views", nullable: true })
  views!: number | null;

  @Column("integer", { name: "reach", nullable: true })
  reach!: number | null;

  @Column("integer", { name: "likes", nullable: true })
  likes!: number | null;

  @Column("integer", { name: "comments", nullable: true })
  comments!: number | null;

  @Column("integer", { name: "shares", nullable: true })
  shares!: number | null;

  @Column("integer", { name: "saved", nullable: true })
  saved!: number | null;

  @Column("timestamptz", { name: "pulledAt", default: () => "now()" })
  pulledAt!: Date;
}
