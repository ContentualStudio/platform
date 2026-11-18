/* oxlint-disable no-console -- narrated walkthrough printed to the terminal */
/* oxlint-disable no-await-in-loop -- hits must be sequential or the window is meaningless */

import { z } from "zod";
import {
  setRateLimitBackend,
  type RateLimitBackend,
  type RateLimitDecision,
  type RateLimitName,
} from "../lib/rate-limit";
import { rateLimits } from "../lib/rate-limit/limits";
import { ActionFailure } from "../lib/server/result";
import { defineRouteHandler } from "../lib/server/route";
import { enforceRateLimit } from "../lib/rate-limit/enforce";

/**
 * Narrated walkthrough of the named rate-limit contract, for demoing the ticket.
 *
 * It drives the REAL wrappers and the REAL named limits. Only the Redis store is
 * replaced — by an in-memory sliding window that uses the same counts and
 * windows — so the walkthrough runs without an Upstash credential and without
 * touching production counters.
 *
 *   yarn workspace @contentual/web demo:rate-limit
 *
 * Pass `--fast` to skip the pauses when you just want the output.
 */

const fast = process.argv.includes("--fast");

const pause = (ms: number) =>
  fast ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms));

function scene(title: string): void {
  console.log(`\n\n  ── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}\n`);
}

function formatWindow(name: RateLimitName): string {
  const spec = rateLimits[name];
  const unit =
    spec.windowMs >= 60 * 60_000
      ? "hour"
      : spec.windowMs >= 60_000
        ? "minute"
        : "second";
  return `${spec.limit} per ${spec.keyBy === "ip" ? "IP" : "user"} per ${unit}`;
}

/**
 * Sliding window over the named config, same contract Upstash enforces in
 * production: hits older than the window fall off, so a blocked caller gets
 * back in once the oldest request ages out.
 */
function memoryBackend(): RateLimitBackend {
  const hits = new Map<string, number[]>();

  return {
    async limit(name, identifier): Promise<RateLimitDecision> {
      const spec = rateLimits[name];
      const now = Date.now();
      const key = `${name}:${identifier}`;
      const recent = (hits.get(key) ?? []).filter(
        (stamp) => stamp > now - spec.windowMs,
      );

      if (recent.length >= spec.limit) {
        return { allowed: false, resetAt: recent[0]! + spec.windowMs };
      }

      recent.push(now);
      hits.set(key, recent);
      return { allowed: true };
    },
  };
}

function jsonRequest(body: unknown, ip: string): Request {
  return new Request("http://contentual.test/api/auth/email/send-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function sendLoginCode(
  ip: string,
  handler: { ran: number },
): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
  const POST = defineRouteHandler({
    name: "sendEmailCode",
    rateLimit: "auth",
    input: z.object({ email: z.string() }),
    failureMessage: "We couldn't send a login code. Try again shortly.",
    handler: async () => {
      handler.ran += 1;
      return { sent: true };
    },
  });

  const response = await POST(
    jsonRequest({ email: "ada@example.test" }, ip),
  );

  return {
    status: response.status,
    body: await response.json(),
    retryAfter: response.headers.get("Retry-After"),
  };
}

function showRefusal(error: unknown): void {
  if (!(error instanceof ActionFailure)) {
    throw error;
  }

  console.log(`      status      refused (${error.code})`);
  console.log(`      message     ${error.message}`);
  if (error.retryAfterMs !== undefined) {
    const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
    console.log(`      try again   in ${seconds}s`);
  }
  console.log(
    `      observed    rate_limit_exceeded  { limiter, operation } — no IP`,
  );
}

async function main(): Promise<void> {
  setRateLimitBackend(memoryBackend());

  console.log("\n  Upstash Redis rate limiting");
  console.log("  ===========================");
  console.log("\n  Same named limiters and the same Server Action / Route Handler");
  console.log("  wrappers the app uses. Redis is the store in production; this");
  console.log("  walkthrough keeps the window in memory so it runs without a");
  console.log("  credential and without charging a real IP or user.");

  scene("1. Three named limits, declared once");

  console.log(`      auth               ${formatWindow("auth")}`);
  console.log(`      mutation           ${formatWindow("mutation")}`);
  console.log(`      analyticsRefresh   ${formatWindow("analyticsRefresh")}`);
  console.log("\n      Feature code names one of these. It does not restate a");
  console.log("      count or a window, so a change here is a change everywhere.");
  await pause(1600);

  scene("2. Auth — 10 login-code attempts per IP per minute");

  const adaIp = "203.0.113.10";
  const borisIp = "198.51.100.20";
  const authHandler = { ran: 0 };

  console.log(`      Ada's IP ${adaIp} is requesting login codes.\n`);

  for (let n = 1; n <= 10; n += 1) {
    const result = await sendLoginCode(adaIp, authHandler);
    if (n === 1 || n === 10) {
      console.log(
        `      ${String(n).padStart(2, " ")}/10  ${result.status} allowed   handler sent the code`,
      );
    } else if (n === 2) {
      console.log("           …");
    }
  }

  const blocked = await sendLoginCode(adaIp, authHandler);
  console.log(
    `      11/10  ${blocked.status} BLOCKED  ${JSON.stringify(blocked.body)}`,
  );
  console.log(`               Retry-After: ${blocked.retryAfter}s`);
  console.log(
    `\n      handler ran ${authHandler.ran} times, not 11 — the 11th never`,
  );
  console.log("      reached send-code. No email, no side effect.");
  await pause(2000);

  console.log(`\n      Boris's IP ${borisIp} is a different bucket:\n`);
  const other = await sendLoginCode(borisIp, { ran: 0 });
  console.log(
    `      1/10   ${other.status} allowed   Boris is not paying for Ada's retries.`,
  );
  await pause(1600);

  scene("3. Data mutations — 60 writes per user per minute");

  const ada = "user-ada";
  const boris = "user-boris";
  const mutationHeaders = new Headers({ "x-forwarded-for": adaIp });
  let mutationsAllowed = 0;

  console.log("      Ada is saving notification preferences.\n");

  for (let n = 1; n <= 60; n += 1) {
    await enforceRateLimit({
      name: "mutation",
      operation: "setNotificationPreference",
      source: "action",
      headers: mutationHeaders,
      userId: ada,
    });
    mutationsAllowed += 1;
  }

  console.log(`      1–60/${rateLimits.mutation.limit}  allowed`);

  try {
    await enforceRateLimit({
      name: "mutation",
      operation: "setNotificationPreference",
      source: "action",
      headers: mutationHeaders,
      userId: ada,
    });
    console.log("      61    allowed  — UNEXPECTED, investigate");
  } catch (error) {
    console.log(`      61    blocked after ${mutationsAllowed} writes:`);
    showRefusal(error);
  }

  console.log("\n      Boris saving the same preference is a different user:\n");
  await enforceRateLimit({
    name: "mutation",
    operation: "setNotificationPreference",
    source: "action",
    headers: mutationHeaders,
    userId: boris,
  });
  console.log("      1/60  allowed   his budget is his own.");
  await pause(2000);

  scene("4. Manual analytics refresh — 1 per user per hour");

  console.log("      Ada taps Refresh on Instagram analytics.\n");

  await enforceRateLimit({
    name: "analyticsRefresh",
    operation: "refreshAnalytics",
    source: "action",
    headers: mutationHeaders,
    userId: ada,
  });
  console.log("      1/1   allowed   snapshot rebuilds.");

  try {
    await enforceRateLimit({
      name: "analyticsRefresh",
      operation: "refreshAnalytics",
      source: "action",
      headers: mutationHeaders,
      userId: ada,
    });
    console.log("      2/1   allowed  — UNEXPECTED, investigate");
  } catch (error) {
    console.log("      2/1   blocked — and the copy says when she can try again:\n");
    showRefusal(error);
  }

  console.log("\n      'Try again shortly' would be a lie for a one-hour window,");
  console.log("      so this limiter names the moment the next refresh is allowed.");
  await pause(2000);

  scene("5. What the caller sees, and what we see");

  console.log("      Caller     RATE_LIMITED + a message they can show.");
  console.log("                 Auth/mutation:  \"Too many requests. Try again shortly.\"");
  console.log("                 Analytics:      next refresh timestamp.");
  console.log("                 HTTP routes:    429 and Retry-After.");
  console.log("\n      We see     rate_limit_exceeded { limiter, operation }");
  console.log("                 so a spike in blocked requests is a query, not a");
  console.log("                 guess. The IP itself never goes on that event.");
  await pause(1600);

  scene("Summary");

  console.log("  auth               10 / IP / minute     send + verify login codes");
  console.log("  mutation           60 / user / minute   authenticated writes");
  console.log("  analyticsRefresh    1 / user / hour     Instagram refresh, when it lands");
  console.log("\n  Over-limit is refused before the handler, so a blocked caller");
  console.log("  cannot trigger a send, a save, or a refresh.");
  console.log("  Windows roll: once the oldest request ages out, access returns.");
  console.log("\n  Production store is Upstash Redis, via");
  console.log("    UPSTASH_REDIS_REST_URL");
  console.log("    UPSTASH_REDIS_REST_TOKEN");
  console.log("  — server-only, never NEXT_PUBLIC_. An absent pair disables");
  console.log("  limiting rather than failing the app, which is why local and");
  console.log("  CI run without a credential.\n");

  setRateLimitBackend(undefined);
}

main().catch((error: unknown) => {
  setRateLimitBackend(undefined);
  console.error("\n  demo failed:", error);
  process.exit(1);
});
