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
 * The per-user billing identity: the Stripe customer, the referral code and
 * the founding-creator facts.
 *
 * Its own table rather than columns on `user`: Better Auth serialises the whole
 * user row into the session cookie cache, so billing facts there would travel
 * with every request. Here they are read only by Billing and the rule
 * evaluator.
 */
@Entity({ name: "billing_account" })
@Index("UQ_billing_account_stripe_customer", ["stripeCustomerId"], { unique: true })
@Index("UQ_billing_account_referral_code", ["referralCode"], { unique: true })
export class BillingAccountEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "stripeCustomerId", nullable: true })
  stripeCustomerId!: string | null;

  @Column("text", { name: "referralCode" })
  referralCode!: string;

  @Column("boolean", { name: "isFoundingCreator", default: false })
  isFoundingCreator!: boolean;

  /** Minor units of the price in effect at the founding purchase. */
  @Column("integer", { name: "foundingLockedAmount", nullable: true })
  foundingLockedAmount!: number | null;

  @Column("text", { name: "foundingLockedCurrency", nullable: true })
  foundingLockedCurrency!: string | null;

  @Column("timestamptz", { name: "foundingGrantedAt", nullable: true })
  foundingGrantedAt!: Date | null;

  /** The first confirmed paid transition. Drives once-only referral rewards. */
  @Column("timestamptz", { name: "firstPaidAt", nullable: true })
  firstPaidAt!: Date | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
