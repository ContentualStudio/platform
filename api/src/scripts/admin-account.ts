import "../database/data-source";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import databaseConfig from "../config/database.config";

interface QueryResult {
  rowCount: number | null;
  rows: Record<string, unknown>[];
}

export interface SqlExecutor {
  query(statement: string, parameters?: unknown[]): Promise<QueryResult>;
}

export type AddAdminResult =
  | { status: "created"; id: string; email: string }
  | { status: "exists"; email: string };

export type RemoveAdminResult =
  | { status: "removed"; email: string; sessions: number }
  | { status: "not_found"; email: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(input: string) {
  const email = input.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`"${input}" is not a valid email address.`);
  }

  return email;
}

/**
 * The only way an admin account comes into existence. The admin auth
 * instance runs with sign-up disabled, so this row is what lets an email
 * receive a sign-in code at all.
 */
export async function addAdmin(
  database: SqlExecutor,
  inputEmail: string,
  name?: string,
): Promise<AddAdminResult> {
  const email = normaliseEmail(inputEmail);
  const result = await database.query(
    `INSERT INTO "admin_account" ("id", "name", "email", "emailVerified")
     VALUES ($1, $2, $3, true)
     ON CONFLICT (lower("email")) DO NOTHING
     RETURNING "id"`,
    [randomUUID(), name?.trim() || email.split("@")[0], email],
  );
  const id = result.rows[0]?.id;

  return typeof id === "string"
    ? { status: "created", id, email }
    : { status: "exists", email };
}

/**
 * Deleting the account cascades to its sessions, and the admin instance has
 * no cookie cache, so removal locks the person out on their next request.
 */
export async function removeAdmin(
  database: SqlExecutor,
  inputEmail: string,
): Promise<RemoveAdminResult> {
  const email = normaliseEmail(inputEmail);

  await database.query("BEGIN");

  try {
    const sessions = await database.query(
      `DELETE FROM "admin_session"
       WHERE "userId" IN (SELECT "id" FROM "admin_account" WHERE lower("email") = $1)`,
      [email],
    );
    const account = await database.query(
      `DELETE FROM "admin_account" WHERE lower("email") = $1 RETURNING "id"`,
      [email],
    );

    await database.query("COMMIT");

    return account.rowCount
      ? { status: "removed", email, sessions: sessions.rowCount ?? 0 }
      : { status: "not_found", email };
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

export async function listAdmins(database: SqlExecutor) {
  const result = await database.query(
    `SELECT a."email", a."name", a."createdAt",
            max(s."updatedAt") AS "lastSeenAt"
       FROM "admin_account" a
       LEFT JOIN "admin_session" s ON s."userId" = a."id"
      GROUP BY a."id"
      ORDER BY a."createdAt"`,
  );

  return result.rows as {
    email: string;
    name: string;
    createdAt: Date;
    lastSeenAt: Date | null;
  }[];
}

const USAGE = [
  "Usage:",
  "  yarn workspace @contentual/api admin:account add <email> [display name]",
  "  yarn workspace @contentual/api admin:account remove <email> --confirm",
  "  yarn workspace @contentual/api admin:account list",
].join("\n");

async function main() {
  const [command, email, ...rest] = process.argv.slice(2);
  const { database } = databaseConfig();
  const pool = new Pool({
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    if (command === "add" && email) {
      const result = await addAdmin(pool, email, rest.join(" "));

      console.info(
        result.status === "created"
          ? `Created admin account for ${result.email}. They can now sign in at /admin/sign-in.`
          : `${result.email} already has an admin account.`,
      );
      return;
    }

    if (command === "remove" && email && rest[0] === "--confirm") {
      const result = await removeAdmin(pool, email);

      console.info(
        result.status === "removed"
          ? `Removed ${result.email} and ended ${result.sessions} session(s).`
          : `No admin account found for ${result.email}.`,
      );
      return;
    }

    if (command === "list") {
      const admins = await listAdmins(pool);

      if (admins.length === 0) {
        console.info("No admin accounts.");
        return;
      }

      console.table(
        admins.map((admin) => ({
          email: admin.email,
          name: admin.name,
          created: admin.createdAt.toISOString(),
          lastSeen: admin.lastSeenAt?.toISOString() ?? "never",
        })),
      );
      return;
    }

    throw new Error(USAGE);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
