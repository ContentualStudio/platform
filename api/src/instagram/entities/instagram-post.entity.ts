import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Read-only schema mirror for `migration:generate` — every write goes through
// raw SQL in the daily pull. Names match 1785150000000-InstagramPosts exactly.
@Entity({ name: "instagram_post" })
@Index("IDX_instagram_post_recent", ["userId", "postedAt"])
@Index("IDX_instagram_post_top", ["userId", "views"], {
  where: `"views" IS NOT NULL`,
})
@Check(
  "CHK_instagram_post_nonneg",
  `COALESCE("views", 0) >= 0 AND COALESCE("likes", 0) >= 0 AND COALESCE("comments", 0) >= 0`,
)
export class InstagramPostEntity {
  @PrimaryColumn("text", { name: "userId", primaryKeyConstraintName: "PK_instagram_post" })
  userId!: string;

  @PrimaryColumn("text", { name: "mediaId", primaryKeyConstraintName: "PK_instagram_post" })
  mediaId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_instagram_post_user" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "mediaType", nullable: true })
  mediaType!: string | null;

  @Column("text", { name: "permalink", nullable: true })
  permalink!: string | null;

  @Column("timestamptz", { name: "postedAt", nullable: true })
  postedAt!: Date | null;

  @Column("text", { name: "caption", nullable: true })
  caption!: string | null;

  @Column("text", { name: "thumbnailUrl", nullable: true })
  thumbnailUrl!: string | null;

  @Column("integer", { name: "views", nullable: true })
  views!: number | null;

  @Column("integer", { name: "likes", nullable: true })
  likes!: number | null;

  @Column("integer", { name: "comments", nullable: true })
  comments!: number | null;

  @Column("timestamptz", { name: "updatedAt", default: () => "now()" })
  updatedAt!: Date;
}
