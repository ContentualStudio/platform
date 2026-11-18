import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { returnedRows } from "../../content-engine/returned-rows";
import { EmailService } from "../../email/email.service";
import type { AdminIdentity } from "../admin-auth.service";

// "Added by" comes from the audit log rather than a column: it snapshots the
// inviter's email, so it still reads after the inviter is removed. Accounts
// the admin:account script created have no entry and come back null.
const TEAM_SQL = `
  SELECT a."id", a."name", a."email", a."createdAt" AS "addedAt",
         (SELECT l."actorEmail"
            FROM "admin_audit_log" l
           WHERE l."action" = 'admin.invited' AND l."targetEmail" = lower(a."email")
           ORDER BY l."createdAt" DESC
           LIMIT 1) AS "addedBy",
         (SELECT max(s."updatedAt")
            FROM "admin_session" s
           WHERE s."userId" = a."id") AS "lastSeenAt"
    FROM "admin_account" a
   ORDER BY a."createdAt"
`;

// ON CONFLICT on the lower(email) unique index: inviting an existing admin —
// or the same invite submitted twice — inserts nothing and returns no row.
const INSERT_ADMIN_SQL = `
  INSERT INTO "admin_account" ("id", "name", "email", "emailVerified")
  VALUES ($1, $2, $3, true)
  ON CONFLICT (lower("email")) DO NOTHING
  RETURNING "id"
`;

const INSERT_AUDIT_SQL = `
  INSERT INTO "admin_audit_log" ("action", "actorId", "actorEmail", "targetEmail")
  VALUES ($1, $2, $3, $4)
`;

export interface AdminTeamMember {
  id: string;
  name: string;
  email: string;
  addedAt: string;
  /** The inviting admin's email; null for an account the script created. */
  addedBy: string | null;
  lastSeenAt: string | null;
}

export type InviteResult =
  | { status: "invited"; email: string; emailSent: boolean }
  | { status: "already_admin"; email: string };

export type RemoveResult =
  | { status: "removed"; email: string }
  | { status: "not_found" };

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

/**
 * Who is on the internal team, and the two changes an admin can make to it.
 *
 * Both writes are idempotent at the database: an invite that finds the email
 * already present inserts nothing, and a removal that finds no row deletes
 * nothing — and in either case no audit row is written, so a double submission
 * can never apply twice or log twice.
 */
@Injectable()
export class AdminTeamService {
  private readonly logger = new Logger(AdminTeamService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async list(): Promise<{ members: AdminTeamMember[] }> {
    const rows = returnedRows<
      Omit<AdminTeamMember, "addedAt" | "lastSeenAt"> & { addedAt: Date; lastSeenAt: Date | null }
    >(await this.dataSource.query(TEAM_SQL));

    return {
      members: rows.map((row) => ({
        ...row,
        addedAt: iso(row.addedAt)!,
        lastSeenAt: iso(row.lastSeenAt),
      })),
    };
  }

  async invite(
    actor: AdminIdentity,
    input: { email: string; name?: string },
  ): Promise<InviteResult> {
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || email.split("@")[0]!;

    const created = await this.dataSource.transaction(async (manager) => {
      const [row] = returnedRows<{ id: string }>(
        await manager.query(INSERT_ADMIN_SQL, [randomUUID(), name, email]),
      );

      if (row) {
        await manager.query(INSERT_AUDIT_SQL, ["admin.invited", actor.id, actor.email, email]);
      }

      return Boolean(row);
    });

    if (!created) {
      return { status: "already_admin", email };
    }

    // After commit: the account exists whether or not the email lands, and a
    // failed send must not roll back an invite the log already records.
    const result = await this.email.sendAdminInvite({
      to: email,
      invitedBy: actor.name || actor.email,
      signInUrl: this.signInUrl(),
    });

    if (!result.ok) {
      this.logger.error(`Admin invite email failed: ${result.error}`);
    }

    return { status: "invited", email, emailSent: result.ok };
  }

  async remove(actor: AdminIdentity, targetId: string): Promise<RemoveResult> {
    if (targetId === actor.id) {
      throw new ForbiddenException({
        code: "CANNOT_REMOVE_SELF",
        message: "You can't remove yourself. Ask another admin to remove you.",
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // Serialises concurrent removals, so two admins removing each other at
      // once cannot both pass the last-admin check and empty the team.
      await manager.query(`LOCK TABLE "admin_account" IN SHARE ROW EXCLUSIVE MODE`);

      // A target that is already gone is a repeat submission: answer it as a
      // no-op before the last-admin check, which would otherwise misreport it.
      const [target] = returnedRows<{ id: string }>(
        await manager.query(`SELECT "id" FROM "admin_account" WHERE "id" = $1`, [targetId]),
      );

      if (!target) {
        return { status: "not_found" } as const;
      }

      const [{ count }] = returnedRows<{ count: number }>(
        await manager.query(`SELECT count(*)::int AS "count" FROM "admin_account"`),
      );

      if (count <= 1) {
        throw new ConflictException({
          code: "LAST_ADMIN",
          message: "You can't remove the last admin.",
        });
      }

      // Sessions go with the account (ON DELETE CASCADE), so the removed admin
      // is signed out on their next request.
      const [removed] = returnedRows<{ email: string }>(
        await manager.query(`DELETE FROM "admin_account" WHERE "id" = $1 RETURNING "email"`, [
          targetId,
        ]),
      );

      await manager.query(INSERT_AUDIT_SQL, [
        "admin.removed",
        actor.id,
        actor.email,
        removed!.email.toLowerCase(),
      ]);

      // The table lock means the row checked above is still there to delete.
      return { status: "removed", email: removed!.email } as const;
    });
  }

  private signInUrl() {
    const origin = this.config.get<string>("auth.webOrigin") ?? "http://localhost:3000";

    return new URL("/admin/sign-in", origin).toString();
  }
}
