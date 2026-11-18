import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import type { ConfigService } from "@nestjs/config";
import { queryRouter } from "../content-engine/testing/content-event-fakes";
import {
  ConsentRequiredError,
  InstagramNotConfiguredError,
  InstagramTokenService,
  NoLiveConnectionError,
  TokenUnusableError,
} from "./instagram-token.service";
import { encryptToken } from "./token-crypto";
import { permissionStaleAfterMs } from "./token-lifecycle";

const key = Buffer.alloc(32, 5);
const plaintext = "IGQVJtestaccesstokenvalueforservice";
const connectionId = "17";
const userId = "user-1";

interface ConnectionOverrides {
  readonly dataConsent?: boolean;
  readonly status?: string;
  readonly expiresAt?: Date;
  readonly issuedAt?: Date;
  readonly lastUsedAt?: Date | null;
  readonly missing?: boolean;
  readonly aadUserId?: string;
}

function build(overrides: ConnectionOverrides = {}) {
  const now = Date.now();
  const issuedAt = overrides.issuedAt ?? new Date(now - 60_000);
  const expiresAt = overrides.expiresAt ?? new Date(now + 60 * 24 * 3_600_000);

  const sealed = encryptToken({
    plaintext,
    key,
    keyId: "v1",
    aad: `${connectionId}:${overrides.aadUserId ?? userId}`,
  });

  const connectionRow = {
    connectionId,
    connectionOrdinal: 1,
    externalAccountId: "ig-123",
    username: "creator",
    accountType: "professional",
    status: overrides.status ?? "connected",
    dataConsent: overrides.dataConsent ?? true,
    connectedAt: new Date(now - 3_600_000),
    scopes: ["instagram_business_basic"],
    issuedAt,
    expiresAt,
    lastRefreshedAt: null,
    lastUsedAt: overrides.lastUsedAt ?? null,
  };

  const credentialRow = {
    connectionId,
    keyId: sealed.keyId,
    iv: sealed.iv,
    authTag: sealed.authTag,
    ciphertext: sealed.ciphertext,
    scopes: ["instagram_business_basic"],
    issuedAt,
    expiresAt,
    lastRefreshedAt: null,
    lastUsedAt: overrides.lastUsedAt ?? null,
  };

  const statements: { sql: string; params: readonly unknown[] }[] = [];

  const query = queryRouter([
    {
      match: (sql) => sql.includes(`LEFT JOIN "platform_connection_credential"`),
      handle: async () => (overrides.missing ? [] : [connectionRow]),
    },
    {
      match: (sql) => sql.includes(`FROM "platform_connection_credential" cred`),
      handle: async () => (overrides.missing ? [] : [credentialRow]),
    },
    {
      match: (sql) => sql.includes(`SET "lastUsedAt" = now()`),
      handle: async () => [[], 1],
    },
    {
      match: (sql) => sql.includes(`SET "status" = $3`),
      handle: async () => [{ id: connectionId }],
    },
    {
      match: (sql) => sql.includes(`SET "dataConsent" = $3`),
      handle: async () => [{ id: connectionId }],
    },
    {
      match: (sql) => sql.includes(`INSERT INTO "platform_connection_credential"`),
      handle: async () => [{ connectionId }],
    },
    {
      match: (sql) => sql.includes(`DELETE FROM "platform_connection_credential"`),
      handle: async () => [{ connectionId }],
    },
  ]);

  const dataSource = {
    query: async (sql: string, params?: readonly unknown[]) => {
      statements.push({ sql, params: params ?? [] });
      return query(sql, params);
    },
  } as unknown as DataSource;

  const config = {
    get: (path: string) =>
      path === "instagram.tokenKey" ? key : path === "instagram.tokenKeyId" ? "v1" : undefined,
  } as unknown as ConfigService;

  return {
    service: new InstagramTokenService(dataSource, config),
    statements,
    sealed,
  };
}

test("the connection view carries no token field", async () => {
  const { service } = build();

  const connection = await service.getConnection(userId);

  assert.ok(connection);
  assert.ok(!("accessToken" in connection));
  assert.ok(!("ciphertext" in connection));
  assert.equal(connection.username, "creator");
});

test("withAccessToken hands the plaintext to the callback and nothing else", async () => {
  const { service } = build();
  let seen = "";

  const result = await service.withAccessToken(userId, async (token) => {
    seen = token;
    return "done";
  });

  assert.equal(seen, plaintext);
  assert.equal(result, "done");
});

// The flag defaults to not-granted and gates everything. Enforced here, not at
// the call sites, so it holds for call sites that do not exist yet.
test("no token is decrypted for a user who has not consented", async () => {
  const { service } = build({ dataConsent: false });

  await assert.rejects(
    () => service.withAccessToken(userId, async () => "should not run"),
    ConsentRequiredError,
  );
});

test("a connection needing reconnect refuses to hand out its token", async () => {
  const { service } = build({ status: "reconnect_required" });

  await assert.rejects(
    () => service.withAccessToken(userId, async () => "should not run"),
    TokenUnusableError,
  );
});

test("a user with no live connection is refused before any decryption", async () => {
  const { service } = build({ missing: true });

  await assert.rejects(
    () => service.withAccessToken(userId, async () => "should not run"),
    NoLiveConnectionError,
  );
});

// A token that lapses between the status write and now must not keep
// presenting as connected — the refusal also records the new status.
test("an expired token is refused and the connection is marked for reconnect", async () => {
  const { service, statements } = build({ expiresAt: new Date(Date.now() - 1) });

  await assert.rejects(
    () => service.withAccessToken(userId, async () => "should not run"),
    TokenUnusableError,
  );

  const statusWrite = statements.find((entry) =>
    entry.sql.includes(`SET "status" = $3`),
  );

  assert.ok(statusWrite);
  assert.equal(statusWrite.params[2], "reconnect_required");
});

test("a permission unused for ninety days is refused as reconnect_required", async () => {
  const { service } = build({
    issuedAt: new Date(Date.now() - permissionStaleAfterMs - 1),
    lastUsedAt: null,
  });

  await assert.rejects(
    () => service.withAccessToken(userId, async () => "should not run"),
    TokenUnusableError,
  );
});

// lastUsedAt drives the ninety-day rule, so a call that failed did not use the
// permission and must not restart its clock.
test("a failed call does not stamp the permission as used", async () => {
  const { service, statements } = build();

  await assert.rejects(() =>
    service.withAccessToken(userId, async () => {
      throw new Error("graph exploded");
    }),
  );

  assert.equal(
    statements.some((entry) => entry.sql.includes(`SET "lastUsedAt" = now()`)),
    false,
  );
});

test("a successful call stamps the permission as used", async () => {
  const { service, statements } = build();

  await service.withAccessToken(userId, async () => "ok");

  assert.ok(
    statements.some((entry) => entry.sql.includes(`SET "lastUsedAt" = now()`)),
  );
});

// The AAD binds a ciphertext to its row and its owner.
test("a credential sealed for another user fails to open", async () => {
  const { service } = build({ aadUserId: "user-2" });

  await assert.rejects(() =>
    service.withAccessToken(userId, async () => "should not run"),
  );
});

test("storing a token never writes the plaintext into a parameter", async () => {
  const { service, statements } = build();

  await service.storeToken({
    userId,
    connectionId,
    accessToken: plaintext,
    expiresInSeconds: 5_184_000,
    scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
  });

  const insert = statements.find((entry) =>
    entry.sql.includes(`INSERT INTO "platform_connection_credential"`),
  );

  assert.ok(insert);
  for (const param of insert.params) {
    assert.ok(
      !String(param).includes(plaintext),
      "a bound parameter carried the plaintext token",
    );
  }
});

test("a token with no granted scopes is refused rather than stored", async () => {
  const { service } = build();

  await assert.rejects(() =>
    service.storeToken({
      userId,
      connectionId,
      accessToken: plaintext,
      expiresInSeconds: 100,
      scopes: [],
    }),
  );
});

// A missing key is a deployment mistake; guessing would store a plaintext
// token, which is unrecoverable.
test("storing without an encryption key fails loudly", async () => {
  const { service } = build();
  const unconfigured = new InstagramTokenService(
    (service as unknown as { dataSource: DataSource }).dataSource,
    { get: () => undefined } as unknown as ConfigService,
  );

  await assert.rejects(
    () =>
      unconfigured.storeToken({
        userId,
        connectionId,
        accessToken: plaintext,
        expiresInSeconds: 100,
        scopes: ["instagram_business_basic"],
      }),
    InstagramNotConfiguredError,
  );
});

test("every read and write is scoped to the calling user", async () => {
  const { service, statements } = build();

  await service.withAccessToken(userId, async () => "ok");
  await service.setConsent(userId, true);
  await service.deleteCredential(userId);

  for (const entry of statements) {
    assert.equal(
      entry.params[0],
      userId,
      `statement was not scoped to the user: ${entry.sql.trim().slice(0, 60)}`,
    );
  }
});
