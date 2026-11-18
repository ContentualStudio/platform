import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

export const referralStatuses = {
  referred: "referred",
  converted: "converted",
  rewarded: "rewarded",
} as const;

export type ReferralStatus =
  (typeof referralStatuses)[keyof typeof referralStatuses];

/**
 * One row per referred user: who referred them, and how far the referral has
 * got. A referred user is attributed to at most one referrer (unique index),
 * and a user can never refer themselves (CHECK in the migration).
 */
@Entity({ name: "referral" })
@Index("UQ_referral_referred", ["referredUserId"], { unique: true })
@Index("IDX_referral_referrer", ["referrerUserId", "createdAt"])
export class ReferralEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column("text", { name: "referrerUserId" })
  referrerUserId!: string;

  @Column("text", { name: "referredUserId" })
  referredUserId!: string;

  @Column("text", { name: "referralCode" })
  referralCode!: string;

  @Column("text", { default: referralStatuses.referred })
  status!: ReferralStatus;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @Column("timestamptz", { name: "convertedAt", nullable: true })
  convertedAt!: Date | null;

  @Column("timestamptz", { name: "rewardedAt", nullable: true })
  rewardedAt!: Date | null;

  /** The Stripe event that confirmed the referred user's first paid month. */
  @Column("text", { name: "conversionEventId", nullable: true })
  conversionEventId!: string | null;

  /** What was applied where, e.g. `sub_123:coupon_free_month`. */
  @Column("text", { name: "rewardReference", nullable: true })
  rewardReference!: string | null;
}
