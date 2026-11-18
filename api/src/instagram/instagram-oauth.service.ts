import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import { INSTAGRAM_SCOPES } from "./graph-instagram-api";
import { INSTAGRAM_API, type InstagramApiPort } from "./instagram-api.port";
import { InstagramTokenService } from "./instagram-token.service";

/**
 * Mints and consumes the OAuth `state` that ties an authorization redirect back
 * to the user who started it.
 *
 * A table rather than a self-contained signed token, because single use is a
 * property of a row being consumed: no signature can tell you whether the same
 * value has already been presented. The row also carries the consent the user
 * granted before authorising — at that moment no connection row exists yet to
 * hold it.
 */

export interface StartedAuthorization {
  readonly state: string;
  readonly authorizeUrl: string;
}

export interface ConsumedState {
  readonly userId: string;
  readonly dataConsent: boolean;
  readonly returnPath: string | null;
}

const INSERT_STATE_SQL = `
  INSERT INTO "instagram_oauth_state"
    ("state", "userId", "dataConsent", "returnPath", "expiresAt")
  VALUES ($1, $2, $3, $4, now() + ($5 || ' milliseconds')::interval)
  RETURNING "state"
`;

// Consume and read in one statement. Two statements would leave a window in
// which the same state could be redeemed twice by concurrent callbacks, which
// is the exact thing the table exists to prevent.
const CONSUME_STATE_SQL = `
  UPDATE "instagram_oauth_state"
     SET "consumedAt" = now()
   WHERE "state" = $1
     AND "consumedAt" IS NULL
     AND "expiresAt" > now()
  RETURNING "userId", "dataConsent", "returnPath"
`;

const DELETE_EXPIRED_STATES_SQL = `
  DELETE FROM "instagram_oauth_state"
   WHERE "expiresAt" < now() - interval '1 day'
`;

@Injectable()
export class InstagramOauthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly tokens: InstagramTokenService,
    @Inject(INSTAGRAM_API) private readonly api: InstagramApiPort,
  ) {}

  /**
   * Whether a Meta app is configured at all.
   *
   * The OAuth endpoints answer 503 rather than pretending when it is not: an
   * authorize url built from a missing app id would send the user to an
   * Instagram error page, which is a worse answer than "not available yet".
   */
  get configured(): boolean {
    return this.config.get<boolean>("instagram.configured") === true;
  }

  async startAuthorization(input: {
    userId: string;
    dataConsent: boolean;
    returnPath?: string | null;
  }): Promise<StartedAuthorization> {
    // 32 bytes of randomness: this value is the only thing standing between a
    // forged callback and a connected account.
    const state = randomBytes(32).toString("base64url");
    const ttlMs = this.config.get<number>("instagram.oauthStateTtlMs") ?? 600_000;

    await this.dataSource.query(INSERT_STATE_SQL, [
      state,
      input.userId,
      input.dataConsent,
      input.returnPath ?? null,
      String(ttlMs),
    ]);

    return { state, authorizeUrl: this.authorizeUrl(state) };
  }

  async consumeState(state: string): Promise<ConsumedState | null> {
    const [row] = returnedRows<{
      userId: string;
      dataConsent: boolean;
      returnPath: string | null;
    }>(await this.dataSource.query(CONSUME_STATE_SQL, [state]));

    if (!row) {
      return null;
    }

    return {
      userId: row.userId,
      dataConsent: Boolean(row.dataConsent),
      returnPath: row.returnPath,
    };
  }

  /**
   * Exchanges an authorization code for a long-lived token.
   *
   * Two hops, because Meta issues a one-hour token from the code and only the
   * second exchange yields the sixty-day one the daily pull depends on.
   */
  async exchangeCodeForLongLivedToken(code: string): Promise<
    | { ok: true; accessToken: string; expiresInSeconds: number }
    | { ok: false; error: string }
  > {
    const short = await this.api.exchangeCode(code);

    if (!short.ok) {
      return { ok: false, error: short.error };
    }

    const long = await this.api.exchangeForLongLived(short.value.accessToken);

    if (!long.ok) {
      return { ok: false, error: long.error };
    }

    return {
      ok: true,
      accessToken: long.value.accessToken,
      expiresInSeconds: long.value.expiresInSeconds,
    };
  }

  /** Stores the freshly minted token against the connection that now exists. */
  async storeGrantedToken(input: {
    userId: string;
    connectionId: string;
    accessToken: string;
    expiresInSeconds: number;
  }): Promise<void> {
    await this.tokens.storeToken({
      userId: input.userId,
      connectionId: input.connectionId,
      accessToken: input.accessToken,
      expiresInSeconds: input.expiresInSeconds,
      scopes: [...INSTAGRAM_SCOPES],
    });
  }

  /** Housekeeping for abandoned authorizations. */
  async purgeExpiredStates(): Promise<void> {
    await this.dataSource.query(DELETE_EXPIRED_STATES_SQL);
  }

  private authorizeUrl(state: string): string {
    const base =
      this.config.get<string>("instagram.oauthBaseUrl") ??
      "https://www.instagram.com";
    const url = new URL(`${base.replace(/\/$/, "")}/oauth/authorize`);

    url.searchParams.set("client_id", this.config.get<string>("instagram.appId") ?? "");
    url.searchParams.set(
      "redirect_uri",
      this.config.get<string>("instagram.redirectUri") ?? "",
    );
    url.searchParams.set("response_type", "code");
    // Exactly the two read-only scopes. Every extra one adds its own screencast
    // to App Review, so asking for one we do not use is not free.
    url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
    url.searchParams.set("state", state);

    return url.toString();
  }
}
