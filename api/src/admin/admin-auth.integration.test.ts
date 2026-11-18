import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { Pool } from "pg";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase,
  testDatabaseUrl,
} from "../database/testing/test-data-source";
import type { EmailService } from "../email/email.service";
import { addAdmin, removeAdmin } from "../scripts/admin-account";
import { ADMIN_COOKIE_PREFIX, AdminAuthService } from "./admin-auth.service";

const ADMIN_EMAIL = "integration-admin@contentual.test";
const STRANGER_EMAIL = "integration-stranger@contentual.test";

let dataSource: DataSource;
let service: AdminAuthService;
// The admin-account script speaks pg's QueryResult, not TypeORM's row arrays.
let pool: Pool;
const sentCodes: { to: string; code: string }[] = [];
const IP = "203.0.113.7";

function rejectsWith(code: string, status: number) {
  return (error: unknown) => {
    const http = error as { getStatus(): number; getResponse(): { code: string } };
    return http.getStatus() === status && http.getResponse().code === code;
  };
}

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    // Each test signs in afresh; the throttles have their own tests below.
    "adminAuth.resendMax": 100,
    "adminAuth.lookupMaxPerIp": 100,
    ...overrides,
    "database.url": testDatabaseUrl,
    "adminAuth.baseUrl": "http://localhost:3001/api/admin-auth",
    "auth.trustedOrigins": ["http://localhost:3000"],
  };

  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const email = {
  async sendLoginCode(input: { to: string; code: string }) {
    sentCodes.push({ to: input.to, code: input.code });
    return { ok: true };
  },
} as unknown as EmailService;

function request(cookie?: string): Request {
  return {
    headers: {
      origin: "http://localhost:3000",
      ...(cookie ? { cookie } : {}),
    },
  } as unknown as Request;
}

function response() {
  const cookies: string[] = [];
  let body: unknown;
  const res = {
    append(name: string, value: string) {
      if (name.toLowerCase() === "set-cookie") cookies.push(value);
      return res;
    },
    status() {
      return res;
    },
    json(value: unknown) {
      body = value;
      return res;
    },
  };

  return {
    res: res as unknown as Response,
    cookies,
    body: () => body,
    // The browser would send back name=value only.
    cookieHeader: () => cookies.map((cookie) => cookie.split(";")[0]).join("; "),
  };
}

async function signIn(address: string) {
  sentCodes.length = 0;
  await service.sendCode(address, IP);
  const sent = sentCodes.find((entry) => entry.to === address);
  assert.ok(sent, "expected a code to be sent");

  const out = response();
  await service.verifyCode({ email: address, code: sent.code }, request(), out.res);
  return out;
}

before(async () => {
  if (skipWithoutDatabase) return;

  dataSource = await openTestDataSource();
  pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
  await dataSource.query(`DELETE FROM "admin_account" WHERE "email" IN ($1, $2)`, [
    ADMIN_EMAIL,
    STRANGER_EMAIL,
  ]);
  await addAdmin(pool, ADMIN_EMAIL, "Integration Admin");

  service = new AdminAuthService(config(), email);
  await service.onModuleInit();
});

after(async () => {
  if (skipWithoutDatabase) return;

  await dataSource.query(`DELETE FROM "admin_account" WHERE "email" = $1`, [ADMIN_EMAIL]);
  await service.onModuleDestroy();
  await pool.end();
  await dataSource.destroy();
});

test("the admin check ignores case", { skip: skipWithoutDatabase }, async () => {
  sentCodes.length = 0;

  assert.deepEqual(await service.sendCode(ADMIN_EMAIL.toUpperCase(), IP), { success: true });
  assert.equal(sentCodes.length, 1);
});

test("an email with no admin account is refused at the first step and sent nothing", { skip: skipWithoutDatabase }, async () => {
  sentCodes.length = 0;

  await assert.rejects(service.sendCode(STRANGER_EMAIL, IP), rejectsWith("ADMIN_NOT_FOUND", 403));
  assert.equal(sentCodes.length, 0);

  const [{ count }] = await dataSource.query(
    `SELECT count(*)::int AS count FROM "admin_account" WHERE "email" = $1`,
    [STRANGER_EMAIL],
  );
  assert.equal(count, 0);
});

test("a wrong code is refused without issuing a session", { skip: skipWithoutDatabase }, async () => {
  sentCodes.length = 0;
  await service.sendCode(ADMIN_EMAIL, IP);
  const out = response();

  await assert.rejects(
    service.verifyCode({ email: ADMIN_EMAIL, code: "000000" }, request(), out.res),
    (error: unknown) =>
      (error as { getResponse(): { code: string } }).getResponse().code === "INVALID_OTP",
  );
  assert.equal(out.cookies.some((c) => c.includes("session_token=") && !c.includes("session_token=;")), false);
});

test("the right code issues an admin-prefixed session the guard resolves", { skip: skipWithoutDatabase }, async () => {
  const out = await signIn(ADMIN_EMAIL);

  assert.ok(
    out.cookies.some((cookie) => cookie.startsWith(`${ADMIN_COOKIE_PREFIX}.session_token=`)),
    `expected a ${ADMIN_COOKIE_PREFIX} session cookie, got ${out.cookies.join(" | ")}`,
  );
  assert.deepEqual(out.body(), { redirectTo: "/admin" });

  const admin = await service.getSession(request(out.cookieHeader()), response().res);
  assert.equal(admin?.email, ADMIN_EMAIL);
  assert.equal(admin?.name, "Integration Admin");
});

test("a product session cookie is not an admin session", { skip: skipWithoutDatabase }, async () => {
  const out = await signIn(ADMIN_EMAIL);
  const productCookie = out
    .cookieHeader()
    .replaceAll(`${ADMIN_COOKIE_PREFIX}.`, "better-auth.");

  assert.equal(await service.getSession(request(productCookie), response().res), null);
});

test("sign-out ends the session", { skip: skipWithoutDatabase }, async () => {
  const out = await signIn(ADMIN_EMAIL);
  const cookie = out.cookieHeader();

  await service.signOut(request(cookie), response().res);

  assert.equal(await service.getSession(request(cookie), response().res), null);
});

test("removing the account locks the admin out on the next request", { skip: skipWithoutDatabase }, async () => {
  const out = await signIn(ADMIN_EMAIL);
  const cookie = out.cookieHeader();

  assert.equal((await removeAdmin(pool, ADMIN_EMAIL)).status, "removed");
  assert.equal(await service.getSession(request(cookie), response().res), null);

  await addAdmin(pool, ADMIN_EMAIL, "Integration Admin");
});

test("resends past the per-minute limit are refused and not sent", { skip: skipWithoutDatabase }, async () => {
  const throttled = new AdminAuthService(config({ "adminAuth.resendMax": 2 }), email);
  sentCodes.length = 0;

  try {
    await throttled.sendCode(ADMIN_EMAIL, IP);
    await throttled.sendCode(ADMIN_EMAIL, IP);
    await assert.rejects(throttled.sendCode(ADMIN_EMAIL, IP), rejectsWith("TOO_MANY_ATTEMPTS", 429));

    assert.equal(sentCodes.length, 2);
  } finally {
    await throttled.onModuleDestroy();
  }
});

test("one client cannot probe emails past the per-IP limit", { skip: skipWithoutDatabase }, async () => {
  const throttled = new AdminAuthService(config({ "adminAuth.lookupMaxPerIp": 3 }), email);

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(
        throttled.sendCode(`probe-${attempt}@contentual.test`, IP),
        rejectsWith("ADMIN_NOT_FOUND", 403),
      );
    }

    // Past the limit even a real admin email is refused, so the answer stops
    // telling the prober anything.
    await assert.rejects(throttled.sendCode(ADMIN_EMAIL, IP), rejectsWith("TOO_MANY_ATTEMPTS", 429));
    // Another client is unaffected.
    assert.deepEqual(await throttled.sendCode(ADMIN_EMAIL, "198.51.100.1"), { success: true });
  } finally {
    await throttled.onModuleDestroy();
  }
});
