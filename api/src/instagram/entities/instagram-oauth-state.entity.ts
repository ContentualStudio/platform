import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

// Read-only schema mirror for `migration:generate`. Index and constraint names
// match 1784890000000-InstagramTokenStore exactly.
//
// A table rather than a self-contained signed token because single-use is a
// property of a row being consumed: no signature can enforce that the same
// value is not presented twice.
@Entity({ name: "instagram_oauth_state" })
@Index("IDX_instagram_oauth_state_expiry", ["expiresAt"])
export class InstagramOauthStateEntity {
  @PrimaryColumn("text", { name: "state" })
  state!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_instagram_oauth_state_user",
  })
  user!: BetterAuthUserEntity;

  // The consent the user gave before authorising, carried here because no
  // connection row exists yet to hold it.
  @Column("boolean", { name: "dataConsent", default: false })
  dataConsent!: boolean;

  @Column("text", { name: "returnPath", nullable: true })
  returnPath!: string | null;

  @Column("timestamptz", { name: "createdAt", default: () => "now()" })
  createdAt!: Date;

  @Column("timestamptz", { name: "expiresAt" })
  expiresAt!: Date;

  @Column("timestamptz", { name: "consumedAt", nullable: true })
  consumedAt!: Date | null;
}
