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

// Every table the Content Engine event wiring keyed to a user, beyond
// challenge_setup itself. None of these cascade from a challenge_setup
// delete — they're keyed to "user", not to challenge_setup — so each needs
// its own explicit clear.
const CONTENT_ENGINE_TABLES = [
  "programme_task_progress",
  "programme_week_completion",
  "user_streak",
  "user_level",
  "programme_completion",
  "platform_connection",
  "follower_snapshot",
  "follower_milestone",
] as const;

export type ResetChallengeResult =
  | {
      status: "not_found";
      email: string;
    }
  | {
      status: "reset";
      userId: string;
      email: string;
      deleted: {
        challengeSetup: number;
        contentEngineRows: number;
        programmeAssignments: number;
      };
    };

// Clears a user's Stage 2 (challenge setup) and every Content Engine table
// keyed to them, so the flow — and its events — can be retested from the
// dashboard "Get Started". Leaves the user, session, and Stage 1 profile
// intact.
export async function resetChallenge(
  database: SqlExecutor,
  inputEmail: string,
): Promise<ResetChallengeResult> {
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

    let contentEngineRows = 0;
    for (const table of CONTENT_ENGINE_TABLES) {
      const result = await database.query(
        `DELETE FROM "${table}" WHERE "userId" = $1`,
        [userId],
      );
      contentEngineRows += result.rowCount ?? 0;
    }
    await database.query(
      `DELETE FROM "content_engine_events" WHERE "userId" = $1`,
      [userId],
    );

    const challengeSetup = await database.query(
      'DELETE FROM "challenge_setup" WHERE "userId" = $1 RETURNING "userId" AS id',
      [userId],
    );

    const programmeAssignments = await database.query(
      'DELETE FROM "programme_assignment" WHERE "userId" = $1',
      [userId],
    );

    await database.query("COMMIT");
    transactionOpen = false;

    return {
      status: "reset",
      userId,
      email: storedEmail,
      deleted: {
        challengeSetup: challengeSetup.rowCount ?? 0,
        contentEngineRows,
        programmeAssignments: programmeAssignments.rowCount ?? 0,
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
    throw new Error("reset:challenge is disabled in production.");
  }

  const email = process.argv[2];
  const confirmation = process.argv[3];

  if (!email || confirmation !== "--confirm" || process.argv.length !== 4) {
    throw new Error(
      "Usage: yarn workspace @contentual/api reset:challenge <email@example.com> --confirm",
    );
  }

  const { database } = databaseConfig();
  const pool = new Pool({
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await resetChallenge(pool, email);

    if (result.status === "not_found") {
      console.info(`No user found for ${result.email}.`);
      return;
    }

    console.info(`Reset challenge setup for ${result.email} (${result.userId}).`);
    console.info(
      `Deleted ${result.deleted.challengeSetup} challenge_setup row(s), ` +
        `${result.deleted.programmeAssignments} programme_assignment row(s), and ` +
        `${result.deleted.contentEngineRows} Content Engine row(s). ` +
        "Stage 1 profile and session left intact.",
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
