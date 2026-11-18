import { Check, Column, Entity, Index, PrimaryColumn } from "typeorm";

// Read-only schema mirror for `migration:generate`. Names match
// 1784910000000-MetaDeletionRequests exactly.
//
// No relation to the user entity on purpose: this row outlives the data it
// erased, so a cascade from "user" would delete the very record that proves the
// erasure happened.
@Entity({ name: "meta_deletion_request" })
@Index("IDX_meta_deletion_request_account", ["externalAccountId", "receivedAt"])
@Check(
  "CHK_meta_deletion_request_status",
  `"status" IN ('received', 'completed', 'no_match', 'failed')`,
)
@Check(
  "CHK_meta_deletion_request_completed",
  `("status" IN ('completed', 'no_match')) = ("completedAt" IS NOT NULL)`,
)
export class MetaDeletionRequestEntity {
  @PrimaryColumn("text", { name: "confirmationCode" })
  confirmationCode!: string;

  @Column("text", { name: "platform", default: "instagram" })
  platform!: string;

  @Column("text", { name: "externalAccountId" })
  externalAccountId!: string;

  @Column("text", { name: "userId", nullable: true })
  userId!: string | null;

  @Column("text", { name: "status", default: "received" })
  status!: "received" | "completed" | "no_match" | "failed";

  @Column("timestamptz", { name: "receivedAt", default: () => "now()" })
  receivedAt!: Date;

  @Column("timestamptz", { name: "completedAt", nullable: true })
  completedAt!: Date | null;

  @Column("text", { name: "lastError", nullable: true })
  lastError!: string | null;
}
