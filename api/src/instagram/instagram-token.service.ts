import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import {
  decryptToken,
  encryptToken,
  type EncryptedToken,
} from "./token-crypto";
import {
  resolveStatus,
  type ConnectionStatus,
  type TokenTimestamps,
} from "./token-lifecycle";

/**
 * The only code permitted to read, write, refresh or decrypt an Instagram
 * access token.
 *
 * The guarantee is structural, not a convention: no method on this class
 * returns a plaintext token. Feature code hands work to `withAccessToken` and
 * the plaintext lives only in that callback's scope. A method that *returned*
 * one would move the guarantee back to every call site, which is where it was
 * before this class existed.
 *
 * Consent is enforced here for the same reason. The data-consent flag defaults
 * to not-granted and gates every exchange, refresh and pull; checking it at the
 * call sites would mean it holds for the call sites someone remembered.
 */

export const PLATFORM = "instagram";

export class InstagramNotConfiguredError extends Error {
  constructor() {
    super("Instagram is not configured; no Meta app credentials are present.");
    this.name = "InstagramNotConfiguredError";
  }
}

export class ConsentRequiredError extends Error {
  constructor() {
    super("Instagram data consent has not been granted.");
    this.name = "ConsentRequiredError";
  }
}

export class NoLiveConnectionError extends Error {
  constructor() {
    super("No live Instagram connection for this user.");
    this.name = "NoLiveConnectionError";
  }
}

export class TokenUnusableError extends Error {
  constructor(readonly status: ConnectionStatus) {
    super(`Instagram token is not usable; connection is ${status}.`);
    this.name = "TokenUnusableError";
  }
}

/** The non-secret view of a connection. Deliberately has no token field. */
export interface InstagramConnectionView {
  readonly connectionId: string;
  readonly connectionOrdinal: number;
  readonly externalAccountId: string;
  readonly username: string;
  readonly accountType: "professional" | "personal" | null;
  readonly status: ConnectionStatus;
  readonly dataConsent: boolean;
  readonly connectedAt: Date;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly lastRefreshedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

export interface StoreTokenInput {
  readonly userId: string;
  readonly connectionId: string;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[];
}

const GET_LIVE_CONNECTION_SQL = `
  SELECT c."id"                AS "connectionId",
         c."connectionOrdinal" AS "connectionOrdinal",
         c."externalAccountId" AS "externalAccountId",
         c."username"          AS "username",
         c."accountType"       AS "accountType",
         c."status"            AS "status",
         c."dataConsent"       AS "dataConsent",
         c."connectedAt"       AS "connectedAt",
         cred."scopes"          AS "scopes",
         cred."expiresAt"       AS "expiresAt",
         cred."lastRefreshedAt" AS "lastRefreshedAt",
         cred."lastUsedAt"      AS "lastUsedAt"
  FROM "platform_connection" c
  LEFT JOIN "platform_connection_credential" cred ON cred."connectionId" = c."id"
  WHERE c."userId" = $1 AND c."platform" = $2 AND c."disconnectedAt" IS NULL
  LIMIT 1
`;

// Selected separately from the connection view so the ciphertext is loaded only
// on the one path that decrypts it.
const GET_CREDENTIAL_SQL = `
  SELECT cred."connectionId", cred."keyId", cred."iv", cred."authTag",
         cred."ciphertext", cred."scopes", cred."issuedAt", cred."expiresAt",
         cred."lastRefreshedAt", cred."lastUsedAt"
  FROM "platform_connection_credential" cred
  JOIN "platform_connection" c ON c."id" = cred."connectionId"
  WHERE cred."userId" = $1 AND c."platform" = $2 AND c."disconnectedAt" IS NULL
  LIMIT 1
`;

const UPSERT_CREDENTIAL_SQL = `
  INSERT INTO "platform_connection_credential"
    ("connectionId", "userId", "keyId", "iv", "authTag", "ciphertext",
     "scopes", "issuedAt", "expiresAt")
  VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
  ON CONFLICT ("connectionId") DO UPDATE SET
    "keyId" = EXCLUDED."keyId",
    "iv" = EXCLUDED."iv",
    "authTag" = EXCLUDED."authTag",
    "ciphertext" = EXCLUDED."ciphertext",
    "scopes" = EXCLUDED."scopes",
    "issuedAt" = EXCLUDED."issuedAt",
    "expiresAt" = EXCLUDED."expiresAt",
    "lastRefreshedAt" = now()
  RETURNING "connectionId"
`;

const TOUCH_LAST_USED_SQL = `
  UPDATE "platform_connection_credential"
     SET "lastUsedAt" = now()
   WHERE "userId" = $1 AND "connectionId" = $2
`;

const SET_CONSENT_SQL = `
  UPDATE "platform_connection"
     SET "dataConsent" = $3,
         "consentGrantedAt" = CASE WHEN $3 THEN now() ELSE "consentGrantedAt" END
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
  RETURNING "id"
`;

// Guarded on the live partial index rather than on an id, so a status write can
// never revive a disconnected connection. `disconnected` is not settable here —
// that is the disconnect cascade's job, and it moves `disconnectedAt` with it.
const SET_STATUS_SQL = `
  UPDATE "platform_connection"
     SET "status" = $3
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
     AND $3 IN ('connected', 'reconnect_required')
  RETURNING "id"
`;

// Scoped by connection, not by user. The credential table is keyed on
// `connectionId` and is deliberately platform-agnostic, so a user-only
// predicate would destroy every other platform's token the day a second one
// lands — silently, with nothing to catch it.
const DELETE_CREDENTIAL_SQL = `
  DELETE FROM "platform_connection_credential"
   WHERE "connectionId" IN (
     SELECT "id" FROM "platform_connection"
      WHERE "userId" = $1 AND "platform" = $2
   )
  RETURNING "connectionId"
`;

interface CredentialRow extends EncryptedToken {
  readonly connectionId: string;
  readonly scopes: string[];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly lastRefreshedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

@Injectable()
export class InstagramTokenService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
  ) {}

  /** The non-secret connection view, or null when the user has none live. */
  async getConnection(userId: string): Promise<InstagramConnectionView | null> {
    const [row] = returnedRows<Record<string, unknown>>(
      await this.dataSource.query(GET_LIVE_CONNECTION_SQL, [userId, PLATFORM]),
    );

    if (!row) {
      return null;
    }

    return {
      connectionId: String(row.connectionId),
      connectionOrdinal: Number(row.connectionOrdinal),
      externalAccountId: String(row.externalAccountId),
      username: String(row.username),
      accountType: (row.accountType as "professional" | "personal" | null) ?? null,
      status: row.status as ConnectionStatus,
      dataConsent: Boolean(row.dataConsent),
      connectedAt: new Date(row.connectedAt as string),
      scopes: (row.scopes as string[] | null) ?? [],
      expiresAt: row.expiresAt ? new Date(row.expiresAt as string) : null,
      lastRefreshedAt: row.lastRefreshedAt
        ? new Date(row.lastRefreshedAt as string)
        : null,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt as string) : null,
    };
  }

  /**
   * Runs `work` with the user's decrypted access token.
   *
   * The plaintext exists only for the duration of the callback and is never
   * returned, stored or logged. Consent, connection status and expiry are all
   * checked before decryption, so an unusable token is never even opened.
   */
  async withAccessToken<T>(
    userId: string,
    work: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const connection = await this.getConnection(userId);

    if (!connection) {
      throw new NoLiveConnectionError();
    }

    if (!connection.dataConsent) {
      throw new ConsentRequiredError();
    }

    if (connection.status !== "connected") {
      throw new TokenUnusableError(connection.status);
    }

    const credential = await this.readCredential(userId);
    const status = resolveStatus(credential, new Date());

    if (status !== "connected") {
      // Recorded, not just refused: the UI's reconnect prompt reads this, and a
      // token that lapsed between the status write and now must not silently
      // keep presenting as connected.
      await this.setStatus(userId, status);
      throw new TokenUnusableError(status);
    }

    const accessToken = decryptToken({
      ...credential,
      key: this.encryptionKey(),
      aad: this.aadFor(credential.connectionId, userId),
    });

    const result = await work(accessToken);

    // Only after the call succeeded: `lastUsedAt` drives the ninety-day
    // unused-permission rule, and a failed call did not use the permission.
    await this.dataSource.query(TOUCH_LAST_USED_SQL, [
      userId,
      credential.connectionId,
    ]);

    return result;
  }

  /** Seals and stores a token. The only write path for the secret. */
  async storeToken(input: StoreTokenInput): Promise<void> {
    if (input.scopes.length === 0) {
      throw new Error("Refusing to store a token with no granted scopes.");
    }

    const sealed = encryptToken({
      plaintext: input.accessToken,
      key: this.encryptionKey(),
      keyId: this.keyId(),
      aad: this.aadFor(input.connectionId, input.userId),
    });

    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);

    await this.dataSource.query(UPSERT_CREDENTIAL_SQL, [
      input.connectionId,
      input.userId,
      sealed.keyId,
      sealed.iv,
      sealed.authTag,
      sealed.ciphertext,
      [...input.scopes],
      expiresAt,
    ]);
  }

  /** Whether the stored token is old enough to be refreshed. */
  async readTimestamps(userId: string): Promise<TokenTimestamps | null> {
    try {
      return await this.readCredential(userId);
    } catch (error) {
      if (error instanceof NoLiveConnectionError) {
        return null;
      }

      throw error;
    }
  }

  async setConsent(userId: string, granted: boolean): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await this.dataSource.query(SET_CONSENT_SQL, [userId, PLATFORM, granted]),
    );

    return rows.length > 0;
  }

  async setStatus(
    userId: string,
    status: Extract<ConnectionStatus, "connected" | "reconnect_required">,
  ): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await this.dataSource.query(SET_STATUS_SQL, [userId, PLATFORM, status]),
    );

    return rows.length > 0;
  }

  /**
   * Destroys the stored token.
   *
   * Separate from the wider purge cascade and called first by it: after this
   * returns there is no usable credential, whatever else fails afterwards.
   */
  async deleteCredential(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const rows = returnedRows<{ connectionId: string }>(
      await (manager ?? this.dataSource).query(DELETE_CREDENTIAL_SQL, [
        userId,
        PLATFORM,
      ]),
    );

    return rows.length;
  }

  private async readCredential(userId: string): Promise<CredentialRow> {
    const [row] = returnedRows<Record<string, unknown>>(
      await this.dataSource.query(GET_CREDENTIAL_SQL, [userId, PLATFORM]),
    );

    if (!row) {
      throw new NoLiveConnectionError();
    }

    return {
      connectionId: String(row.connectionId),
      keyId: String(row.keyId),
      iv: toBuffer(row.iv),
      authTag: toBuffer(row.authTag),
      ciphertext: toBuffer(row.ciphertext),
      scopes: (row.scopes as string[] | null) ?? [],
      issuedAt: new Date(row.issuedAt as string),
      expiresAt: new Date(row.expiresAt as string),
      lastRefreshedAt: row.lastRefreshedAt
        ? new Date(row.lastRefreshedAt as string)
        : null,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt as string) : null,
    };
  }

  // Binding both the row and its owner: ciphertext moved to another user's row
  // fails to open rather than quietly working.
  private aadFor(connectionId: string, userId: string): string {
    return `${connectionId}:${userId}`;
  }

  private encryptionKey(): Buffer {
    const key = this.config?.get<Buffer>("instagram.tokenKey");

    if (!key) {
      // Loud rather than silently storing a plaintext token: a missing key is a
      // deployment mistake, and the failure mode of guessing is unrecoverable.
      throw new InstagramNotConfiguredError();
    }

    return key;
  }

  private keyId(): string {
    return this.config?.get<string>("instagram.tokenKeyId") ?? "v1";
  }
}

// node-postgres hands `bytea` back as a Buffer already, but a driver or a fake
// that returns the hex form would otherwise decrypt to garbage.
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value.startsWith("\\x")
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(value, "binary");
  }

  throw new Error("Stored credential column is not a byte array.");
}
