import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import {
  apiFailure,
  apiSuccess,
  type InstagramApiPort,
} from "./instagram-api.port";
import { InstagramConnectService } from "./instagram-connect.service";
import type { InstagramDailyPullJob } from "./instagram-daily-pull.job";
import type { InstagramOauthService } from "./instagram-oauth.service";
import type { InstagramTokenService } from "./instagram-token.service";
import type { InstagramService } from "./instagram.service";

const USER = "user-1";
const CONNECTION = "7";

interface Options {
  readonly state?: { userId: string; dataConsent: boolean; returnPath: string | null } | null;
  readonly exchange?: { ok: true; accessToken: string; expiresInSeconds: number } | { ok: false; error: string };
  readonly accountType?: "professional" | "personal";
  readonly accountFails?: boolean;
  readonly pullFails?: boolean;
}

function build(options: Options = {}) {
  const stored: unknown[] = [];
  const connects: { userId: string; credential: string }[] = [];
  const statements: { sql: string; params: readonly unknown[] }[] = [];
  const pulls: { userId: string; localDate: string }[] = [];

  const oauth = {
    consumeState: async () =>
      options.state === undefined
        ? { userId: USER, dataConsent: true, returnPath: null }
        : options.state,
    exchangeCodeForLongLivedToken: async () =>
      options.exchange ?? {
        ok: true as const,
        accessToken: "long-lived",
        expiresInSeconds: 5_184_000,
      },
    storeGrantedToken: async (input: unknown) => {
      stored.push(input);
    },
  } as unknown as InstagramOauthService;

  const api = {
    fetchAccount: async () =>
      options.accountFails
        ? apiFailure("auth", "dead token")
        : apiSuccess({
            externalAccountId: "ig-1",
            username: "creator",
            followerCount: 1200,
            accountType: options.accountType ?? "professional",
          }),
  } as unknown as InstagramApiPort;

  const instagram = {
    connect: async (user: { id: string }, credential: string) => {
      connects.push({ userId: user.id, credential });
      return { connected: true };
    },
  } as unknown as InstagramService;

  const tokens = {
    getConnection: async () => ({ connectionId: CONNECTION }),
    withAccessToken: async <T>(_id: string, work: (t: string) => Promise<T>) =>
      work("stored-token"),
  } as unknown as InstagramTokenService;

  const dataSource = {
    query: async (sql: string, params?: readonly unknown[]) => {
      statements.push({ sql, params: params ?? [] });
      return [{ id: CONNECTION }];
    },
  } as unknown as DataSource;

  const dailyPull = {
    run: async (userId: string, localDate: string) => {
      pulls.push({ userId, localDate });
      if (options.pullFails) {
        throw new Error("Instagram insights read failed: upstream 500");
      }
      return "succeeded" as const;
    },
  } as unknown as InstagramDailyPullJob;

  return {
    service: new InstagramConnectService(
      dataSource,
      instagram,
      oauth,
      tokens,
      api,
      dailyPull,
    ),
    stored,
    connects,
    statements,
    pulls,
  };
}

test("a successful callback connects, records the account and stores the token", async () => {
  const { service, stored, connects } = build();

  const outcome = await service.completeAuthorization({ code: "c", state: "s" });

  assert.ok(outcome.ok);
  assert.equal(outcome.username, "creator");
  assert.equal(connects.length, 1);
  assert.equal(stored.length, 1);
});

// The ordering that looks redundant but is forced: the token cannot be stored
// until connect() has created the row it hangs on.
test("the token is stored only after the connection row exists", async () => {
  const { service, stored } = build();

  await service.completeAuthorization({ code: "c", state: "s" });

  assert.deepEqual(stored[0], {
    userId: USER,
    connectionId: CONNECTION,
    accessToken: "long-lived",
    expiresInSeconds: 5_184_000,
  });
});

test("a cancelled authorization stores no token and does not connect", async () => {
  const { service, stored, connects } = build();

  const outcome = await service.completeAuthorization({
    state: "s",
    error: "access_denied",
  });

  assert.ok(!outcome.ok);
  assert.equal(outcome.reason, "cancelled");
  assert.equal(stored.length, 0);
  assert.equal(connects.length, 0);
});

// The failure still knows where the user started, so the callback can send
// them back to that flow rather than to /platforms.
test("a failure after the state is consumed carries its return path", async () => {
  const { service } = build({
    state: { userId: USER, dataConsent: true, returnPath: "/challenge-setup" },
  });

  const outcome = await service.completeAuthorization({
    state: "s",
    error: "access_denied",
  });

  assert.ok(!outcome.ok);
  assert.equal(outcome.returnPath, "/challenge-setup");
});

test("a missing or already-used state is refused before anything else runs", async () => {
  const { service, stored, connects } = build({ state: null });

  const outcome = await service.completeAuthorization({ code: "c", state: "s" });

  assert.ok(!outcome.ok);
  assert.equal(outcome.reason, "invalid_state");
  assert.equal(stored.length, 0);
  assert.equal(connects.length, 0);
});

test("a callback with no state at all is refused", async () => {
  const { service } = build();

  const outcome = await service.completeAuthorization({ code: "c" });

  assert.ok(!outcome.ok);
  assert.equal(outcome.reason, "invalid_state");
});

test("a failed exchange stores no token", async () => {
  const { service, stored, connects } = build({
    exchange: { ok: false, error: "bad code" },
  });

  const outcome = await service.completeAuthorization({ code: "c", state: "s" });

  assert.ok(!outcome.ok);
  assert.equal(outcome.reason, "exchange_failed");
  assert.equal(stored.length, 0);
  assert.equal(connects.length, 0);
});

test("an unreadable account stores no token", async () => {
  const { service, stored } = build({ accountFails: true });

  const outcome = await service.completeAuthorization({ code: "c", state: "s" });

  assert.ok(!outcome.ok);
  assert.equal(outcome.reason, "account_unreadable");
  assert.equal(stored.length, 0);
});

// A personal account still connects. The prompt to convert is a nudge, not a
// gate — onboarding is never hard-blocked on it.
test("a personal account connects and is recorded as personal", async () => {
  const { service, stored, statements } = build({ accountType: "personal" });

  const outcome = await service.completeAuthorization({ code: "c", state: "s" });

  assert.ok(outcome.ok);
  assert.equal(outcome.accountType, "personal");
  assert.equal(stored.length, 1);

  const record = statements.find((entry) =>
    entry.sql.includes(`SET "accountType" = $3`),
  );

  assert.ok(record);
  assert.equal(record.params[2], "personal");
});

// Consent granted before authorising is carried on the state row, because at
// that moment no connection row existed to hold it.
test("consent recorded before authorising is applied to the connection", async () => {
  const { service, statements } = build();

  await service.completeAuthorization({ code: "c", state: "s" });

  const record = statements.find((entry) =>
    entry.sql.includes(`SET "accountType" = $3`),
  );

  assert.ok(record);
  assert.equal(record.params[3], true);
});

test("recheck re-reads the account type and records it", async () => {
  const { service, statements } = build({ accountType: "professional" });

  const result = await service.recheckAccountType(USER);

  assert.deepEqual(result, { accountType: "professional", followerCount: 1200 });
  assert.ok(
    statements.some((entry) => entry.sql.includes(`SET "accountType" = $3`)),
  );
});

// Recheck must not grant consent as a side effect of reading the account.
test("recheck never grants consent", async () => {
  const { service, statements } = build();

  await service.recheckAccountType(USER);

  const record = statements.find((entry) =>
    entry.sql.includes(`SET "accountType" = $3`),
  );

  assert.equal(record?.params[3], false);
});

test("a successful connect pulls the account's data straight away", async () => {
  const { service, pulls } = build();

  const outcome = await service.completeAuthorization({ code: "code", state: "state" });
  await service.initialPull;

  assert.equal(outcome.ok, true);
  assert.equal(pulls.length, 1);
  assert.equal(pulls[0]?.userId, USER);
  assert.match(pulls[0]?.localDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
});

test("a failed initial pull leaves the connect successful", async () => {
  const { service, pulls } = build({ pullFails: true });

  const outcome = await service.completeAuthorization({ code: "code", state: "state" });
  await service.initialPull;

  assert.equal(outcome.ok, true);
  assert.equal(pulls.length, 1);
});

test("a failed connect does not pull", async () => {
  const { service, pulls } = build({ accountFails: true });

  const outcome = await service.completeAuthorization({ code: "code", state: "state" });
  await service.initialPull;

  assert.equal(outcome.ok, false);
  assert.equal(pulls.length, 0);
});
