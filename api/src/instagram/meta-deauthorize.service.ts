import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import { scrubText } from "../observability/scrub-secrets";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { PLATFORM } from "./instagram-token.service";
import { verifySignedRequest } from "./meta-signed-request";

/**
 * Meta's deauthorize callback: the user removed our app from their Instagram
 * settings.
 *
 * Distinct from the data-deletion callback in what the platform is telling us.
 * Deletion is an erasure request that owes the user a confirmation code;
 * deauthorize is notice that our access is gone. What it means for us is
 * simple: the stored token is now worthless, and holding it is the one
 * outcome that would be actively wrong.
 *
 * It runs the same purge the in-app disconnect runs, in `disconnect` mode —
 * the credential is destroyed and the connection is marked disconnected, while
 * the `platform_connection` row itself survives so a later reconnection keeps
 * its ordinal and does not rebuild an event id already delivered.
 *
 * Nothing about the account is echoed back. Like the deletion endpoint, this
 * is callable by anyone who can reach it, and a response that varied by
 * whether the account was known would make it an existence oracle.
 */
export type DeauthorizeOutcome =
  | { readonly ok: true; readonly matched: boolean }
  | { readonly ok: false; readonly reason: string };

const FIND_CONNECTION_SQL = `
  SELECT "userId"
  FROM "platform_connection"
  WHERE "externalAccountId" = $1 AND "platform" = $2
  ORDER BY "connectedAt" DESC
  LIMIT 1
`;

@Injectable()
export class MetaDeauthorizeService {
  private readonly logger = new Logger(MetaDeauthorizeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly purge: InstagramDataPurgeService,
  ) {}

  async handleSignedRequest(signedRequest: string): Promise<DeauthorizeOutcome> {
    const appSecret = this.config.get<string>("instagram.appSecret");

    if (!appSecret) {
      return { ok: false, reason: "not_configured" };
    }

    // First, before the payload is read for anything at all.
    const verified = verifySignedRequest(signedRequest, appSecret);

    if (!verified.ok) {
      return { ok: false, reason: verified.reason };
    }

    const externalAccountId = verified.payload.user_id;

    if (!externalAccountId) {
      return { ok: false, reason: "missing_user_id" };
    }

    const [connection] = returnedRows<{ userId: string }>(
      await this.dataSource.query(FIND_CONNECTION_SQL, [
        externalAccountId,
        PLATFORM,
      ]),
    );

    // An account we do not hold is a successful outcome, not an error. Meta
    // may send this for a user who disconnected in-app moments earlier.
    if (!connection) {
      return { ok: true, matched: false };
    }

    try {
      await this.purge.purge(connection.userId, "disconnect");
    } catch (error) {
      // Reported as a failure so Meta retries: unlike deletion there is no
      // confirmation code standing in for the work, and the purge is
      // idempotent, so a retry is the cheapest way to converge.
      const message = scrubText(
        error instanceof Error ? error.message : String(error),
      );

      this.logger.error(`Instagram deauthorize purge failed: ${message}`);
      return { ok: false, reason: "purge_failed" };
    }

    return { ok: true, matched: true };
  }
}
