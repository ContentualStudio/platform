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
// 1784900000000-InstagramMetrics exactly. Writes go through raw SQL in the
// daily pull.
@Entity({ name: "instagram_account_metric" })
@Index("UQ_instagram_account_metric_day", ["userId", "localDate"], { unique: true })
@Check(
  "CHK_instagram_account_metric_nonneg",
  `"followerCount" >= 0 AND COALESCE("reach", 0) >= 0 AND COALESCE("totalInteractions", 0) >= 0 AND COALESCE("profileLinksTaps", 0) >= 0`,
)
@Check(
  "CHK_instagram_account_metric_views_nonneg",
  `COALESCE("views", 0) >= 0 AND COALESCE("profileViews", 0) >= 0`,
)
export class InstagramAccountMetricEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_instagram_account_metric_user",
  })
  user!: BetterAuthUserEntity;

  @Column("date", { name: "localDate" })
  localDate!: string;

  @Column("integer", { name: "followerCount" })
  followerCount!: number;

  // Nullable throughout: a metric Meta did not return must stay missing rather
  // than become a zero that reads as "nobody saw this".
  @Column("integer", { name: "reach", nullable: true })
  reach!: number | null;

  @Column("integer", { name: "totalInteractions", nullable: true })
  totalInteractions!: number | null;

  @Column("integer", { name: "profileLinksTaps", nullable: true })
  profileLinksTaps!: number | null;

  // Added by 1785200000000-InstagramAccountViews.
  @Column("integer", { name: "views", nullable: true })
  views!: number | null;

  @Column("integer", { name: "profileViews", nullable: true })
  profileViews!: number | null;

  @Column("boolean", { name: "metricsAvailable", default: true })
  metricsAvailable!: boolean;

  @Column("timestamptz", { name: "pulledAt", default: () => "now()" })
  pulledAt!: Date;
}
