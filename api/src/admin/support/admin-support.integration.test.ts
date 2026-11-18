import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { DataSource } from "typeorm";
import type { BillingConfigService } from "../../billing/billing-config.service";
import { BillingRepository } from "../../billing/billing.repository";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../../database/testing/test-data-source";
import type { AdminIdentity } from "../admin-auth.service";
import { AdminSupportService } from "./admin-support.service";

const TOKEN = "zzadminsupport";
const CREATOR = `${TOKEN}-creator`;
const RUNNING = `${TOKEN}-running`;
const now = new Date("2026-10-14T12:00:00.000Z");

const actor: AdminIdentity = {
  id: `${TOKEN}-admin`,
  name: "Support",
  email: "support@contentual.test",
  image: null,
};

const billingConfig = {
  foundingOffer: () => ({ cohortCap: 200 }),
} as unknown as BillingConfigService;

let dataSource: DataSource;
let support: AdminSupportService;

function rejectsWith(code: string, status: number) {
  return (error: unknown) => {
    const http = error as { getStatus(): number; getResponse(): { code: string } };
    return http.getStatus() === status && http.getResponse().code === code;
  };
}

async function logRows(userId: string) {
  return dataSource.query(
    `SELECT "action", "actorEmail", "targetEmail", "reason", "detail"
       FROM "admin_audit_log" WHERE "targetUserId" = $1 ORDER BY "id"`,
    [userId],
  ) as Promise<
    { action: string; actorEmail: string; targetEmail: string; reason: string; detail: Record<string, unknown> }[]
  >;
}

async function lastLogRow(userId: string) {
  const rows = await logRows(userId);
  return rows[rows.length - 1]!;
}

async function enrol(userId: string, day1: string, durationDays: number) {
  await dataSource.query(
    `INSERT INTO "programme_enrolment"
       ("userId", "programmeSlug", "status", "startedAt", "currentDay", "durationDays", "day1ScheduledFor")
     VALUES ($1, 'thirty-day-foundations', 'active', $2::date, $3, $3, $2::date)`,
    [userId, day1, durationDays],
  );
}

async function clear() {
  await dataSource.query(`DELETE FROM "admin_audit_log" WHERE "actorId" = $1`, [actor.id]);
  await dataSource.query(`DELETE FROM "admin_account" WHERE "id" = $1`, [actor.id]);
  await dataSource.query(`DELETE FROM "user" WHERE "id" = ANY($1)`, [[CREATOR, RUNNING]]);
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  support = new AdminSupportService(dataSource, new BillingRepository(dataSource), billingConfig);
  await clear();

  await dataSource.query(
    `INSERT INTO "admin_account" ("id", "name", "email", "emailVerified") VALUES ($1, $2, $3, true)`,
    [actor.id, actor.name, actor.email],
  );
  for (const id of [CREATOR, RUNNING]) {
    await dataSource.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)`, [
      id,
      `${id}@Example.test`,
    ]);
  }

  // Ended 30 Sep, still active on 14 Oct: overdue.
  await enrol(CREATOR, "2026-09-01", 30);
  // Ends 30 Oct: still running.
  await enrol(RUNNING, "2026-10-01", 30);
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await clear();
  await dataSource.destroy();
});

test("the overview offers what applies and disables the rest with a reason", { skip }, async () => {
  const overview = await support.overview(CREATOR, now);

  assert.equal(overview.isFoundingCreator, false);
  assert.equal(overview.activeProgramme?.lastDay, "2026-09-30");
  assert.equal(overview.activeProgramme?.overdue, true);
  assert.deepEqual(
    overview.actions.map((action) => [action.key, action.status]),
    [
      ["grant_founding", "available"],
      ["unflag_founding", "satisfied"],
      ["release_programme", "available"],
    ],
  );
  assert.deepEqual(overview.log, []);
});

test("grant sets the flag and logs exactly one row, even when submitted twice at once", { skip }, async () => {
  const input = { action: "grant_founding" as const, reason: "Promised at launch event" };
  const results = await Promise.all([
    support.apply(actor, CREATOR, input, now),
    support.apply(actor, CREATOR, input, now),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), ["applied", "unchanged"]);

  const [account] = await dataSource.query(
    `SELECT "isFoundingCreator" FROM "billing_account" WHERE "userId" = $1`,
    [CREATOR],
  );
  assert.equal(account.isFoundingCreator, true);

  const rows = await logRows(CREATOR);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.action, "support.founding_granted");
  assert.equal(rows[0]!.actorEmail, actor.email);
  assert.equal(rows[0]!.targetEmail, `${CREATOR}@example.test`);
  assert.equal(rows[0]!.reason, "Promised at launch event");
  assert.deepEqual(rows[0]!.detail.before, { isFoundingCreator: false });
  assert.deepEqual(rows[0]!.detail.after, { isFoundingCreator: true });
});

test("unflag clears the flag and records what it cleared", { skip }, async () => {
  const result = await support.apply(
    actor,
    CREATOR,
    { action: "unflag_founding", reason: "Granted to the wrong account" },
    now,
  );

  assert.equal(result.status, "applied");
  assert.equal(result.status === "applied" && result.entry.action, "unflag_founding");

  const [account] = await dataSource.query(
    `SELECT "isFoundingCreator", "foundingGrantedAt" FROM "billing_account" WHERE "userId" = $1`,
    [CREATOR],
  );
  assert.equal(account.isFoundingCreator, false);
  assert.equal(account.foundingGrantedAt, null);

  const detail = (await lastLogRow(CREATOR)).detail as {
    before: { isFoundingCreator: boolean; foundingGrantedAt: string | null };
  };
  assert.equal(detail.before.isFoundingCreator, true);
  assert.ok(detail.before.foundingGrantedAt);

  // Already unflagged: a no-op with no new row.
  assert.equal(
    (await support.apply(actor, CREATOR, { action: "unflag_founding", reason: "again" }, now))
      .status,
    "unchanged",
  );
  assert.equal((await logRows(CREATOR)).length, 2);
});

test("release closes an overdue programme as abandoned without completing it", { skip }, async () => {
  const result = await support.apply(
    actor,
    CREATOR,
    { action: "release_programme", reason: "Stuck after final day" },
    now,
  );

  assert.equal(result.status, "applied");

  const [enrolment] = await dataSource.query(
    `SELECT "status", "completedAt", "abandonedAt" FROM "programme_enrolment" WHERE "userId" = $1`,
    [CREATOR],
  );
  assert.equal(enrolment.status, "abandoned");
  assert.equal(enrolment.completedAt, null);
  assert.ok(enrolment.abandonedAt);

  const [{ count }] = await dataSource.query(
    `SELECT count(*)::int AS "count" FROM "programme_completion" WHERE "userId" = $1`,
    [CREATOR],
  );
  assert.equal(count, 0);

  const entry = await lastLogRow(CREATOR);
  assert.equal(entry.action, "support.programme_released");
  assert.equal(entry.detail.lastDay, "2026-09-30");
  assert.deepEqual(entry.detail.after, { status: "abandoned" });

  // Nothing left to release.
  assert.equal(
    (await support.apply(actor, CREATOR, { action: "release_programme", reason: "again" }, now))
      .status,
    "unchanged",
  );
});

test("release refuses a programme that is still running and logs nothing", { skip }, async () => {
  await assert.rejects(
    support.apply(actor, RUNNING, { action: "release_programme", reason: "Testing" }, now),
    rejectsWith("SUPPORT_ACTION_NOT_APPLICABLE", 409),
  );

  const [enrolment] = await dataSource.query(
    `SELECT "status" FROM "programme_enrolment" WHERE "userId" = $1`,
    [RUNNING],
  );
  assert.equal(enrolment.status, "active");
  assert.deepEqual(await logRows(RUNNING), []);
});

test("the overview lists the user's support history, newest first", { skip }, async () => {
  const { log } = await support.overview(CREATOR, now);

  assert.deepEqual(
    log.map((entry) => entry.action),
    ["release_programme", "unflag_founding", "grant_founding"],
  );
  assert.equal(log[0]!.actorEmail, actor.email);
});

test("an unknown user is a 404 for both reads and writes", { skip }, async () => {
  await assert.rejects(support.overview(`${TOKEN}-missing`, now), rejectsWith("ADMIN_USER_NOT_FOUND", 404));
  await assert.rejects(
    support.apply(actor, `${TOKEN}-missing`, { action: "grant_founding", reason: "nobody" }, now),
    rejectsWith("ADMIN_USER_NOT_FOUND", 404),
  );
});
