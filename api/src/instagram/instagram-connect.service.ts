import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { localDateFor, resolveTimezone } from "../common/timezone";
import { returnedRows } from "../content-engine/returned-rows";
import { scrubText } from "../observability/scrub-secrets";
import { INSTAGRAM_API, type InstagramApiPort } from "./instagram-api.port";
import { InstagramDailyPullJob } from "./instagram-daily-pull.job";
import { InstagramOauthService } from "./instagram-oauth.service";
import { InstagramTokenService, PLATFORM } from "./instagram-token.service";
import { InstagramService } from "./instagram.service";

/**
 * The connect flow, from the callback Meta redirects to through to a stored
 * token and a recorded account.
 *
 * The order below is forced by a real dependency and is worth stating, because
 * it looks redundant otherwise: the token cannot be stored until a connection
 * row exists to hang it on, and the connection row is created by
 * `InstagramService.connect()` — the same call that emits `platform.connected`
 * and records the day's follower snapshot. So the freshly minted token is
 * passed *through* that call as `credential`, and stored once it returns.
 *
 * `InstagramService` itself is untouched by all of this. Its conditional insert
 * is the emit gate, and a reconnect is already idempotent there.
 */

export type ConnectOutcome =
  | {
      readonly ok: true;
      readonly username: string;
      readonly accountType: "professional" | "personal";
      readonly followerCount: number;
      readonly returnPath: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: ConnectFailureReason;
      // Null when the state could not be read, so there is no path to trust.
      readonly returnPath: string | null;
    };

export type ConnectFailureReason =
  | "cancelled"
  | "invalid_state"
  | "exchange_failed"
  | "account_unreadable";

const RECORD_ACCOUNT_SQL = `
  UPDATE "platform_connection"
     SET "accountType" = $3,
         "lastAccountTypeCheckAt" = now(),
         "dataConsent" = "dataConsent" OR $4,
         "consentGrantedAt" = CASE
           WHEN $4 AND "consentGrantedAt" IS NULL THEN now()
           ELSE "consentGrantedAt"
         END,
         "status" = 'connected'
   WHERE "userId" = $1 AND "platform" = $2 AND "disconnectedAt" IS NULL
  RETURNING "id"
`;

const USER_TIMEZONE_SQL = `
  SELECT "timezone" FROM "user_profile" WHERE "userId" = $1
`;

@Injectable()
export class InstagramConnectService {
  private readonly logger = new Logger(InstagramConnectService.name);

  /** The most recent initial pull, so tests can wait for it to settle. */
  initialPull: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataSource: DataSource,
    private readonly instagram: InstagramService,
    private readonly oauth: InstagramOauthService,
    private readonly tokens: InstagramTokenService,
    @Inject(INSTAGRAM_API) private readonly api: InstagramApiPort,
    private readonly dailyPull: InstagramDailyPullJob,
  ) {}

  /**
   * Completes the authorization Meta redirected back to us.
   *
   * Every failure leaves the user unconnected and no token stored. None of them
   * block onboarding — the caller turns the reason into a retryable banner.
   */
  async completeAuthorization(input: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<ConnectOutcome> {
    if (!input.state) {
      return { ok: false, reason: "invalid_state", returnPath: null };
    }

    // Consumed even when the user cancelled, so a state cannot be replayed
    // after an abandoned authorization.
    const consumed = await this.oauth.consumeState(input.state);

    if (!consumed) {
      return { ok: false, reason: "invalid_state", returnPath: null };
    }

    // From here the state row is ours, so a failure can send the user back to
    // the flow they started from rather than dropping them on /platforms.
    const returnPath = consumed.returnPath;

    if (input.error || !input.code) {
      return { ok: false, reason: "cancelled", returnPath };
    }

    const exchanged = await this.oauth.exchangeCodeForLongLivedToken(input.code);

    if (!exchanged.ok) {
      // Already scrubbed by the http helper, but logged through the scrubbing
      // logger regardless — belt and braces on the one path that handles a
      // token in flight.
      this.logger.warn(`Instagram code exchange failed: ${exchanged.error}`);
      return { ok: false, reason: "exchange_failed", returnPath };
    }

    const account = await this.api.fetchAccount(exchanged.accessToken);

    if (!account.ok) {
      this.logger.warn(`Instagram account read failed: ${account.error}`);
      return { ok: false, reason: "account_unreadable", returnPath };
    }

    // Creates the connection row (or reuses the live one), emits
    // platform.connected exactly once per connection, and records the day's
    // follower snapshot with its milestones. The account read above is handed
    // over rather than repeated — the same `/me` twice is a wasted round trip
    // on a callback the user is waiting on.
    await this.instagram.connect(consumed.userId, { account: account.value });

    const connection = await this.tokens.getConnection(consumed.userId);

    if (!connection) {
      return { ok: false, reason: "account_unreadable", returnPath };
    }

    await this.dataSource.query(RECORD_ACCOUNT_SQL, [
      consumed.userId,
      PLATFORM,
      account.value.accountType,
      consumed.dataConsent,
    ]);

    await this.oauth.storeGrantedToken({
      userId: consumed.userId,
      connectionId: connection.connectionId,
      accessToken: exchanged.accessToken,
      expiresInSeconds: exchanged.expiresInSeconds,
    });

    this.startInitialPull(consumed.userId);

    return {
      ok: true,
      username: account.value.username,
      accountType: account.value.accountType,
      followerCount: account.value.followerCount,
      returnPath,
    };
  }

  /**
   * The first full pull - account metrics, posts and their insights - run as
   * soon as the token is stored, so a new connection shows its data straight
   * away instead of only its follower count until the 7am sweep. The sweep
   * still runs daily and refreshes the same rows; every write in the job is an
   * upsert keyed on the user and day, so running it twice is harmless.
   *
   * Not awaited: the user is waiting on this callback's redirect, and a feed
   * with posts that need their insights fetched one by one can take a while.
   * A failure is logged and left for the sweep rather than failing a connect
   * that has already succeeded.
   */
  private startInitialPull(userId: string): void {
    this.initialPull = this.runInitialPull(userId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Initial Instagram pull failed: ${scrubText(message)}`);
    });
  }

  private async runInitialPull(userId: string): Promise<void> {
    const [profile] = returnedRows<{ timezone: string | null }>(
      await this.dataSource.query(USER_TIMEZONE_SQL, [userId]),
    );
    // The same "today" the sweep would use: the user's own local date.
    const localDate = localDateFor(
      new Date(),
      resolveTimezone(profile?.timezone ?? null),
    );

    await this.dailyPull.run(userId, localDate);
  }

  /**
   * Re-reads the account type after the user says they have converted.
   *
   * Uses the stored token, so it is only available to an already-connected
   * user — which is the only situation the prompt appears in.
   */
  async recheckAccountType(userId: string): Promise<{
    readonly accountType: "professional" | "personal";
    readonly followerCount: number;
  } | null> {
    const result = await this.tokens.withAccessToken(userId, (accessToken) =>
      this.api.fetchAccount(accessToken),
    );

    if (!result.ok) {
      return null;
    }

    await this.dataSource.query(RECORD_ACCOUNT_SQL, [
      userId,
      PLATFORM,
      result.value.accountType,
      false,
    ]);

    return {
      accountType: result.value.accountType,
      followerCount: result.value.followerCount,
    };
  }
}
