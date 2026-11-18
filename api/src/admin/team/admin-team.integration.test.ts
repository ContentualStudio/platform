import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { DataSource } from "typeorm";
import {
  openTestDataSource,
  skipWithoutDatabase as skip,
} from "../../database/testing/test-data-source";
import type { EmailService } from "../../email/email.service";
import type { AdminIdentity } from "../admin-auth.service";
import { AdminTeamService } from "./admin-team.service";

let dataSource: DataSource;
let team: AdminTeamService;
const sent: { to: string; invitedBy: string; signInUrl: string }[] = [];

const owner: AdminIdentity = {
  id: "zzteam-owner",
  name: "Owner",
  email: "owner@contentual.test",
  image: null,
};

const config = {
  get: (key: string) => (key === "auth.webOrigin" ? "https://admin.contentual.test" : undefined),
} as unknown as ConfigService;

const email = {
  async sendAdminInvite(input: { to: string; invitedBy: string; signInUrl: string }) {
    sent.push(input);
    return { ok: true };
  },
} as unknown as EmailService;

function rejectsWith(code: string, status: number) {
  return (error: unknown) => {
    const http = error as { getStatus(): number; getResponse(): { code: string } };
    return http.getStatus() === status && http.getResponse().code === code;
  };
}

async function auditCount() {
  const [{ count }] = await dataSource.query(
    `SELECT count(*)::int AS "count" FROM "admin_audit_log"`,
  );
  return count as number;
}

before(async () => {
  if (skip) return;

  dataSource = await openTestDataSource();
  team = new AdminTeamService(dataSource, email, config);

  // A disposable test database: this suite owns the whole team so the
  // last-admin rule can be exercised exactly.
  await dataSource.query(`DELETE FROM "admin_audit_log"`);
  await dataSource.query(`DELETE FROM "admin_account"`);
  await dataSource.query(
    `INSERT INTO "admin_account" ("id", "name", "email", "emailVerified") VALUES ($1, $2, $3, true)`,
    [owner.id, owner.name, owner.email],
  );
});

after(async () => {
  if (skip || !dataSource?.isInitialized) return;

  await dataSource.query(`DELETE FROM "admin_audit_log"`);
  await dataSource.query(`DELETE FROM "admin_account"`);
  await dataSource.destroy();
});

test("an invite creates the account, logs it once and emails the sign-in link", { skip }, async () => {
  sent.length = 0;

  assert.deepEqual(await team.invite(owner, { email: "  New@Contentual.Test ", name: "New Person" }), {
    status: "invited",
    email: "new@contentual.test",
    emailSent: true,
  });
  assert.deepEqual(sent, [
    {
      to: "new@contentual.test",
      invitedBy: "Owner",
      signInUrl: "https://admin.contentual.test/admin/sign-in",
    },
  ]);
  assert.equal(await auditCount(), 1);

  const { members } = await team.list();
  const added = members.find((member) => member.email === "new@contentual.test");
  assert.equal(added?.name, "New Person");
  assert.equal(added?.addedBy, owner.email);
  // The script-created owner has no invite entry.
  assert.equal(members.find((member) => member.id === owner.id)?.addedBy, null);
});

test("inviting an existing admin, in any case, does nothing", { skip }, async () => {
  sent.length = 0;
  const before = await auditCount();

  assert.deepEqual(await team.invite(owner, { email: "NEW@contentual.test" }), {
    status: "already_admin",
    email: "new@contentual.test",
  });
  assert.equal(sent.length, 0);
  assert.equal(await auditCount(), before);
});

test("an admin cannot remove themselves", { skip }, async () => {
  await assert.rejects(team.remove(owner, owner.id), rejectsWith("CANNOT_REMOVE_SELF", 403));
});

test("removal deletes the account, ends its sessions and logs once; a repeat is a no-op", { skip }, async () => {
  const { members } = await team.list();
  const target = members.find((member) => member.email === "new@contentual.test")!;
  await dataSource.query(
    `INSERT INTO "admin_session" ("id", "token", "expiresAt", "userId") VALUES ('zzteam-s', 'zzteam-t', now() + interval '1 hour', $1)`,
    [target.id],
  );
  const before = await auditCount();

  assert.deepEqual(await team.remove(owner, target.id), {
    status: "removed",
    email: "new@contentual.test",
  });
  const [{ sessions }] = await dataSource.query(
    `SELECT count(*)::int AS "sessions" FROM "admin_session" WHERE "userId" = $1`,
    [target.id],
  );
  assert.equal(sessions, 0);
  assert.equal(await auditCount(), before + 1);

  // Double submission: nothing left to remove, nothing logged.
  assert.deepEqual(await team.remove(owner, target.id), { status: "not_found" });
  assert.equal(await auditCount(), before + 1);
});

test("the audit log records each change once with snapshotted emails", { skip }, async () => {
  const rows = await dataSource.query(
    `SELECT "action", "actorEmail", "targetEmail" FROM "admin_audit_log" ORDER BY "id"`,
  );

  assert.deepEqual(
    rows.map((row: { action: string; actorEmail: string; targetEmail: string }) => [
      row.action,
      row.actorEmail,
      row.targetEmail,
    ]),
    [
      ["admin.invited", owner.email, "new@contentual.test"],
      ["admin.removed", owner.email, "new@contentual.test"],
    ],
  );
});

test("the last remaining admin cannot be removed", { skip }, async () => {
  // Only the owner remains. An acting admin whose own account is already gone
  // is the one way to reach this through the service.
  const ghost: AdminIdentity = { ...owner, id: "zzteam-ghost", email: "ghost@contentual.test" };

  await assert.rejects(team.remove(ghost, owner.id), rejectsWith("LAST_ADMIN", 409));
  assert.equal((await team.list()).members.length, 1);
});
