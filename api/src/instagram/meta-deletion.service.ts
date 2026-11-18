import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import { scrubText } from "../observability/scrub-secrets";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { PLATFORM } from "./instagram-token.service";
import { verifySignedRequest } from "./meta-signed-request";

/**
 * Meta's platform-initiated deletion path.
 *
 * The obligation is to erase the user's platform data and hand back a code the
 * platform can use to check on it. Everything here is arranged so Meta always
 * gets a usable answer:
 *
 *   - An unverified request is refused outright and deletes nothing.
 *   - A verified request for an account we do not hold still gets a valid
 *     confirmation. "Nothing to delete" is a successful outcome.
 *   - A failure during the purge is recorded and still answered, because a
 *     retry storm from Meta would not help and the retry is ours to own.
 */
export type DeletionOutcome =
  | { readonly ok: true; readonly confirmationCode: string; readonly url: string }
  | { readonly ok: false; readonly reason: string };

const FIND_CONNECTION_SQL = `
  SELECT "userId"
  FROM "platform_connection"
  WHERE "externalAccountId" = $1 AND "platform" = $2
  ORDER BY "connectedAt" DESC
  LIMIT 1
`;

// Idempotency. Meta may resend a callback, and re-running the purge would be
// harmless but minting a second code would not: the user would be handed two
// codes for one request and neither would look authoritative.
const FIND_RECENT_REQUEST_SQL = `
  SELECT "confirmationCode"
  FROM "meta_deletion_request"
  WHERE "externalAccountId" = $1
    AND "status" IN ('received', 'completed', 'no_match')
    AND "receivedAt" > now() - interval '1 day'
  ORDER BY "receivedAt" DESC
  LIMIT 1
`;

const INSERT_REQUEST_SQL = `
  INSERT INTO "meta_deletion_request"
    ("confirmationCode", "platform", "externalAccountId", "userId")
  VALUES ($1, $2, $3, $4)
  RETURNING "confirmationCode"
`;

const COMPLETE_REQUEST_SQL = `
  UPDATE "meta_deletion_request"
     SET "status" = $2, "completedAt" = now()
   WHERE "confirmationCode" = $1
`;

const FAIL_REQUEST_SQL = `
  UPDATE "meta_deletion_request"
     SET "status" = 'failed', "lastError" = $2
   WHERE "confirmationCode" = $1
`;

const FIND_BY_CODE_SQL = `
  SELECT "status", "receivedAt", "completedAt"
  FROM "meta_deletion_request"
  WHERE "confirmationCode" = $1
`;

@Injectable()
export class MetaDeletionService {
  private readonly logger = new Logger(MetaDeletionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly purge: InstagramDataPurgeService,
  ) {}

  async handleSignedRequest(signedRequest: string): Promise<DeletionOutcome> {
    const appSecret = this.config.get<string>("instagram.appSecret");

    if (!appSecret) {
      return { ok: false, reason: "not_configured" };
    }

    // First, before the payload is read for anything at all.
    const verified = verifySignedRequest(signedRequest, appSecret);

    if (!verified.ok) {
      return { ok: false, reason: verified.reason };
    }

    const externalAccountId = verified.payload.user_id as string;

    const [existing] = returnedRows<{ confirmationCode: string }>(
      await this.dataSource.query(FIND_RECENT_REQUEST_SQL, [externalAccountId]),
    );

    if (existing) {
      return this.confirmation(existing.confirmationCode);
    }

    const [connection] = returnedRows<{ userId: string }>(
      await this.dataSource.query(FIND_CONNECTION_SQL, [
        externalAccountId,
        PLATFORM,
      ]),
    );

    const confirmationCode = randomUUID();

    await this.dataSource.query(INSERT_REQUEST_SQL, [
      confirmationCode,
      PLATFORM,
      externalAccountId,
      connection?.userId ?? null,
    ]);

    if (!connection) {
      // Nothing to erase is a successful outcome, and Meta still needs its code.
      await this.dataSource.query(COMPLETE_REQUEST_SQL, [
        confirmationCode,
        "no_match",
      ]);

      return this.confirmation(confirmationCode);
    }

    try {
      await this.purge.purge(connection.userId, "erase");
      await this.dataSource.query(COMPLETE_REQUEST_SQL, [
        confirmationCode,
        "completed",
      ]);
    } catch (error) {
      // Answered anyway. The cascade is idempotent, so the recorded failure is
      // a work item rather than a lost request.
      const message = scrubText(
        error instanceof Error ? error.message : String(error),
      );

      this.logger.error(`Meta deletion purge failed: ${message}`);
      await this.dataSource.query(FAIL_REQUEST_SQL, [confirmationCode, message]);
    }

    return this.confirmation(confirmationCode);
  }

  async findStatus(confirmationCode: string): Promise<{
    readonly status: string;
    readonly receivedAt: string;
    readonly completedAt: string | null;
  } | null> {
    const [row] = returnedRows<{
      status: string;
      receivedAt: Date;
      completedAt: Date | null;
    }>(await this.dataSource.query(FIND_BY_CODE_SQL, [confirmationCode]));

    if (!row) {
      return null;
    }

    return {
      status: row.status,
      receivedAt: new Date(row.receivedAt).toISOString(),
      completedAt: row.completedAt
        ? new Date(row.completedAt).toISOString()
        : null,
    };
  }

  private confirmation(confirmationCode: string): DeletionOutcome {
    const webOrigin =
      this.config.get<string>("auth.webOrigin") ?? "http://localhost:3000";
    const url = new URL("/legal/data-deletion", webOrigin);

    url.searchParams.set("code", confirmationCode);

    return { ok: true, confirmationCode, url: url.toString() };
  }
}
