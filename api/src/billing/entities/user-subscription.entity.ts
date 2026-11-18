import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

/**
 * The app's record of a user's Stripe subscription — the source of truth
 * every entitlement read consults. Written only by the webhook handler (and
 * the reconcile script, which runs the same apply path); never by a Checkout
 * return.
 *
 * One row per user: a customer has at most one subscription in this product,
 * and a replacement subscription overwrites the row rather than sitting
 * beside the old one.
 */
@Entity({ name: "user_subscription" })
@Index("UQ_user_subscription_stripe_id", ["stripeSubscriptionId"], { unique: true })
export class UserSubscriptionEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "stripeSubscriptionId" })
  stripeSubscriptionId!: string;

  @Column("text", { name: "stripePriceId" })
  stripePriceId!: string;

  @Column("text")
  tier!: string;

  @Column("text")
  status!: string;

  @Column("boolean", { name: "cancelAtPeriodEnd", default: false })
  cancelAtPeriodEnd!: boolean;

  @Column("timestamptz", { name: "currentPeriodEnd", nullable: true })
  currentPeriodEnd!: Date | null;

  @Column("timestamptz", { name: "canceledAt", nullable: true })
  canceledAt!: Date | null;

  @Column("timestamptz", { name: "endedAt", nullable: true })
  endedAt!: Date | null;

  /**
   * `created` of the last Stripe event applied, in unix seconds. An event
   * older than this is stale and is not allowed to regress the row.
   */
  @Column("bigint", { name: "lastEventCreated", default: 0 })
  lastEventCreated!: string;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
