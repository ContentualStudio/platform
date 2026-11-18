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
@Entity({ name: "platform_connection" })
@Index("UQ_platform_connection_ordinal", ["userId", "platform", "connectionOrdinal"], {
  unique: true,
})
// At most one live connection per user/platform; a disconnected row does not
// block a reconnect. This partial index is the platform.connected emit gate.
@Index("UQ_platform_connection_active", ["userId", "platform"], {
  unique: true,
  where: `"disconnectedAt" IS NULL`,
})
@Check("CHK_platform_connection_ordinal", `"connectionOrdinal" > 0`)
@Check(
  "CHK_platform_connection_status",
  `"status" IN ('connected', 'reconnect_required', 'disconnected')`,
)
@Check(
  "CHK_platform_connection_account_type",
  `"accountType" IS NULL OR "accountType" IN ('professional', 'personal')`,
)
// One fact, two readers. The partial unique index above gates the event; the
// status column drives the UI. This keeps them from ever disagreeing.
@Check(
  "CHK_platform_connection_status_matches_disconnect",
  `("status" = 'disconnected') = ("disconnectedAt" IS NOT NULL)`,
)
export class PlatformConnectionEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_platform_connection_user",
  })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "platform" })
  platform!: string;

  @Column("text", { name: "externalAccountId" })
  externalAccountId!: string;

  @Column("text", { name: "username" })
  username!: string;

  // Discriminator in the platform.connected stable ID: distinguishes a
  // reconnect from the connection it replaced.
  @Column("integer", { name: "connectionOrdinal" })
  connectionOrdinal!: number;

  @Column("timestamptz", { name: "connectedAt", default: () => "now()" })
  connectedAt!: Date;

  @Column("timestamptz", { name: "disconnectedAt", nullable: true })
  disconnectedAt!: Date | null;

  // NULL until the first account read resolves it.
  @Column("text", { name: "accountType", nullable: true })
  accountType!: "professional" | "personal" | null;

  // Defaults to not-granted. Nothing is pulled, exchanged or refreshed for a
  // user whose consent is false.
  @Column("boolean", { name: "dataConsent", default: false })
  dataConsent!: boolean;

  @Column("timestamptz", { name: "consentGrantedAt", nullable: true })
  consentGrantedAt!: Date | null;

  @Column("text", { name: "status", default: "connected" })
  status!: "connected" | "reconnect_required" | "disconnected";

  @Column("timestamptz", { name: "lastAccountTypeCheckAt", nullable: true })
  lastAccountTypeCheckAt!: Date | null;
}
