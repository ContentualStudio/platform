import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { AppModule } from "../app.module";
import { localDateFor, resolveTimezone } from "../common/timezone";
import { returnedRows } from "../content-engine/returned-rows";
import { InstagramDailyPullJob } from "../instagram/instagram-daily-pull.job";

/**
 * Runs the Instagram daily pull for one user, now.
 *
 * The pull normally runs only from the 7am-local sweep, so a fresh connection
 * shows no metrics or posts until the next morning. This runs the very same
 * job (token refresh when due, account metrics, posts, follower sync) once,
 * for testing a connection or backfilling a user, with nothing of its own.
 *
 * Usage: yarn workspace @contentual/api instagram:pull <email>
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: yarn workspace @contentual/api instagram:pull <email>");
    process.exitCode = 1;
    return;
  }

  // This process only runs the one job: keep the in-app workers and the
  // sweep from starting alongside it.
  process.env.CONTENT_ENGINE_BACKFILL_WORKER = "false";
  process.env.BADGE_COOLDOWN_WORKER_ENABLED = "false";
  process.env.DAILY_LOCAL_SWEEP_ENABLED = "false";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const [user] = returnedRows<{ id: string; timezone: string | null }>(
      await app.get(DataSource).query(
        `SELECT u."id", p."timezone"
           FROM "user" u
           LEFT JOIN "user_profile" p ON p."userId" = u."id"
          WHERE lower(u."email") = $1`,
        [email],
      ),
    );

    if (!user) {
      console.error(`No user with email ${email}.`);
      process.exitCode = 1;
      return;
    }

    // The same "today" the sweep would use: the user's own local date.
    const localDate = localDateFor(new Date(), resolveTimezone(user.timezone));
    const outcome = await app.get(InstagramDailyPullJob).run(user.id, localDate);

    console.info(
      outcome === "succeeded"
        ? `Pulled Instagram data for ${email} (${localDate}).`
        : `Skipped ${email}: not connected, no data consent, or the token needs reauthorising.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
