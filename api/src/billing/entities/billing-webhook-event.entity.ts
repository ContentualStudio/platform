import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * The webhook idempotency ledger. One row per Stripe event id, inserted in
 * the same transaction as the state it changed: a duplicate delivery finds
 * the row and stops, a failed delivery rolls the row back with the change so
 * Stripe's retry runs the event for real.
 */
@Entity({ name: "billing_webhook_event" })
@Index("IDX_billing_webhook_event_user", ["userId", "receivedAt"])
export class BillingWebhookEventEntity {
  @PrimaryColumn("text", { name: "stripeEventId" })
  stripeEventId!: string;

  @Column("text")
  type!: string;

  @Column("bigint", { name: "stripeCreated" })
  stripeCreated!: string;

  @Column("text")
  outcome!: string;

  @Column("text", { name: "stripeCustomerId", nullable: true })
  stripeCustomerId!: string | null;

  @Column("text", { name: "userId", nullable: true })
  userId!: string | null;

  @Column("text", { nullable: true })
  detail!: string | null;

  @CreateDateColumn({ name: "receivedAt", type: "timestamptz" })
  receivedAt!: Date;
}
