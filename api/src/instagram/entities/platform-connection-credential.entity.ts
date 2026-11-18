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
import { PlatformConnectionEntity } from "./platform-connection.entity";

// Read-only schema mirror for `migration:generate` — every write to this table
// goes through raw SQL in InstagramTokenService, which is the only code
// permitted to read, write, refresh or decrypt the token it holds. Index and
// constraint names match 1784890000000-InstagramTokenStore exactly.
//
// Separate from `platform_connection` on purpose: ordinary connection reads
// (the analytics snapshot runs on every dashboard load) must not be able to
// load ciphertext by accident.
@Entity({ name: "platform_connection_credential" })
@Index("IDX_platform_connection_credential_user", ["userId"])
@Check("CHK_platform_connection_credential_expiry", `"expiresAt" > "issuedAt"`)
@Check("CHK_platform_connection_credential_scopes", `cardinality("scopes") > 0`)
export class PlatformConnectionCredentialEntity {
  @PrimaryColumn("bigint", { name: "connectionId" })
  connectionId!: string;

  @ManyToOne(() => PlatformConnectionEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "connectionId",
    foreignKeyConstraintName: "FK_platform_connection_credential_connection",
  })
  connection!: PlatformConnectionEntity;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_platform_connection_credential_user",
  })
  user!: BetterAuthUserEntity;

  // Which key sealed these bytes, so rotating adds a key rather than orphaning
  // every token sealed under the old one.
  @Column("text", { name: "keyId" })
  keyId!: string;

  @Column("bytea", { name: "iv" })
  iv!: Buffer;

  @Column("bytea", { name: "authTag" })
  authTag!: Buffer;

  @Column("bytea", { name: "ciphertext" })
  ciphertext!: Buffer;

  @Column("text", { name: "scopes", array: true })
  scopes!: string[];

  @Column("timestamptz", { name: "issuedAt" })
  issuedAt!: Date;

  @Column("timestamptz", { name: "expiresAt" })
  expiresAt!: Date;

  @Column("timestamptz", { name: "lastRefreshedAt", nullable: true })
  lastRefreshedAt!: Date | null;

  // Drives the 90-day unused-permission rule Meta enforces.
  @Column("timestamptz", { name: "lastUsedAt", nullable: true })
  lastUsedAt!: Date | null;

  @Column("timestamptz", { name: "createdAt", default: () => "now()" })
  createdAt!: Date;
}
