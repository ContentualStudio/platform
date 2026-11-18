import "../database/data-source";
import { Pool } from "pg";
import databaseConfig from "../config/database.config";

interface QueryResult {
  rowCount: number | null;
  rows: Record<string, unknown>[];
}

export interface SqlExecutor {
  query(statement: string, parameters?: unknown[]): Promise<QueryResult>;
}

export type ResetTestUserResult =
  | {
      status: "not_found";
      email: string;
    }
  | {
      status: "deleted";
      userId: string;
      email: string;
      deleted: {
        accounts: number;
        profile: number;
        sessions: number;
        verifications: number;
      };
    };

export async function resetTestUser(
  database: SqlExecutor,
  inputEmail: string,
): Promise<ResetTestUserResult> {
  const email = inputEmail.trim().toLowerCase();
  let transactionOpen = false;

  await database.query("BEGIN");
  transactionOpen = true;

  try {
    const user = await database.query(
      'SELECT id, email FROM "user" WHERE email = $1 FOR UPDATE',
      [email],
    );

    if (!user.rows[0]) {
      await database.query("ROLLBACK");
      transactionOpen = false;
      return { status: "not_found", email };
    }

    const selectedUser = user.rows[0];

    if (
      typeof selectedUser.id !== "string" ||
      typeof selectedUser.email !== "string"
    ) {
      throw new Error("The user lookup returned an invalid row.");
    }

    const { id: userId, email: storedEmail } = selectedUser;
    const profile = await database.query(
      'DELETE FROM "user_profile" WHERE "userId" = $1 RETURNING "userId" AS id',
      [userId],
    );
    const sessions = await database.query(
      'DELETE FROM session WHERE "userId" = $1 RETURNING id',
      [userId],
    );
    const accounts = await database.query(
      'DELETE FROM account WHERE "userId" = $1 RETURNING id',
      [userId],
    );
    const verifications = await database.query(
      "DELETE FROM verification WHERE identifier = $1 RETURNING id",
      [storedEmail],
    );

    await database.query('DELETE FROM "user" WHERE id = $1 RETURNING id', [
      userId,
    ]);
    await database.query("COMMIT");
    transactionOpen = false;

    return {
      status: "deleted",
      userId,
      email: storedEmail,
      deleted: {
        accounts: accounts.rowCount ?? 0,
        profile: profile.rowCount ?? 0,
        sessions: sessions.rowCount ?? 0,
        verifications: verifications.rowCount ?? 0,
      },
    };
  } catch (error) {
    if (transactionOpen) {
      await database.query("ROLLBACK");
    }
    throw error;
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("reset:test-user is disabled in production.");
  }

  const email = process.argv[2];
  const confirmation = process.argv[3];

  if (!email || confirmation !== "--confirm" || process.argv.length !== 4) {
    throw new Error(
      "Usage: yarn workspace @contentual/api reset:test-user <email@example.com> --confirm",
    );
  }

  const { database } = databaseConfig();
  const pool = new Pool({
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await resetTestUser(pool, email);

    if (result.status === "not_found") {
      console.info(`No user found for ${result.email}.`);
      return;
    }

    console.info(`Reset ${result.email} (${result.userId}).`);
    console.info(
      `Deleted ${result.deleted.sessions} session(s), ${result.deleted.accounts} account(s), ${result.deleted.profile} profile(s), and ${result.deleted.verifications} verification record(s).`,
    );
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
