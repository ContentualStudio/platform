type SeedEnvironment = Partial<
  Record<
    | "ALLOW_LOCAL_DEMO_SEED"
    | "APP_MIRROR_DATABASE_URL"
    | "DATABASE_URL"
    | "NODE_ENV",
    string | undefined
  >
>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalDatabaseUrl(
  name: "DATABASE_URL" | "APP_MIRROR_DATABASE_URL",
  value: string | undefined,
): void {
  if (!value) {
    throw new Error(`${name} is required for the local demo seed.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !LOCAL_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `${name} must point to localhost. The programme catalogue seed is local-only.`,
    );
  }
}

export function assertLocalDemoSeedEnvironment(env: SeedEnvironment): void {
  if (env.ALLOW_LOCAL_DEMO_SEED !== "true") {
    throw new Error(
      "Set ALLOW_LOCAL_DEMO_SEED=true to acknowledge that this command creates local demo content.",
    );
  }

  if (env.NODE_ENV === "production") {
    throw new Error("The local demo seed cannot run with NODE_ENV=production.");
  }

  assertLocalDatabaseUrl("DATABASE_URL", env.DATABASE_URL);
  assertLocalDatabaseUrl(
    "APP_MIRROR_DATABASE_URL",
    env.APP_MIRROR_DATABASE_URL,
  );
}
