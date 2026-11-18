// Integration tests run the full migration set, which is destructive: the
// content-mirror migration drops and recreates tables and creates database
// roles. Pointing TEST_DATABASE_URL at a development or production database
// would therefore destroy real data, so the guard below refuses to run unless
// the target is demonstrably a separate, disposable database.

interface DatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

// Spellings of the loopback interface that all reach the same server. Without
// this, "localhost" and "127.0.0.1" read as different hosts and the guard would
// wave through a URL pointing at the very database it is meant to protect.
const LOOPBACK_ALIASES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

// A database name counts as disposable only when "test" appears as a whole
// token — otherwise "contest_prod" or "latest" would pass for a test database.
const DISPOSABLE_NAME = /(^|[^a-z])test([^a-z]|$)/i;

function identify(url: string, label: string): DatabaseIdentity {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} could not be parsed as a database URL.`);
  }

  const host = parsed.hostname.toLowerCase();

  return {
    host: LOOPBACK_ALIASES.has(host) ? "localhost" : host,
    // Compare effective ports: an omitted port is 5432, so the two spellings
    // must not read as different databases.
    port: parsed.port || "5432",
    // Credentials and query parameters are ignored — they change how you
    // connect, not which database you reach.
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
}

function sameServer(a: DatabaseIdentity, b: DatabaseIdentity): boolean {
  return a.host === b.host && a.port === b.port;
}

export function assertDisposableTestDatabase(
  testDatabaseUrl: string | undefined,
  applicationDatabaseUrl: string | undefined,
): void {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not set.");
  }

  if (!applicationDatabaseUrl) {
    throw new Error(
      "DATABASE_URL is not set, so TEST_DATABASE_URL cannot be checked against it.",
    );
  }

  const target = identify(testDatabaseUrl, "TEST_DATABASE_URL");
  const application = identify(applicationDatabaseUrl, "DATABASE_URL");

  if (sameServer(target, application) && target.database === application.database) {
    throw new Error(
      "TEST_DATABASE_URL names the same database as DATABASE_URL. " +
        "Integration tests run destructive migrations — point them at a separate database.",
    );
  }

  // Conservative: two hosts that spell differently can still be one server —
  // DNS aliases, a proxy, an SSH tunnel on another port. We cannot prove they
  // are distinct without connecting, so an identical database name is refused
  // wherever it appears to live.
  if (target.database === application.database) {
    throw new Error(
      `TEST_DATABASE_URL database "${target.database}" has the same name as the ` +
        "DATABASE_URL database. The hosts differ, but they may still resolve to " +
        "the same server — use a distinct database name.",
    );
  }

  // Second, independent guard, in case the identity checks are satisfied by an
  // accident of hostname or port.
  if (!DISPOSABLE_NAME.test(target.database)) {
    throw new Error(
      `TEST_DATABASE_URL database "${target.database}" does not look disposable. ` +
        'Its name must contain "test" as a whole word (e.g. "contentual_test").',
    );
  }
}
