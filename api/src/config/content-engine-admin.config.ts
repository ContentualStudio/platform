function readOptional(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The credential the Content Engine admin endpoints require.
 *
 * Absent means the endpoints are closed, not open. This is the opposite of the
 * PostHog config's "no key, no capture" default, and deliberately so: a missing
 * analytics key costs observability, whereas a missing admin key on a
 * fail-open endpoint would let anyone who can reach the API roll a rule out to
 * every user in the product.
 *
 * A shared token rather than a role on `user`, because there is no admin role
 * in the product yet and inventing one as a side effect of a backfill ticket
 * would put an authorisation model nobody designed on the critical path. When
 * the admin engine view brings a real one, this guard is the single place that
 * changes.
 */
export default () => {
  const token = readOptional(process.env.CONTENT_ENGINE_ADMIN_TOKEN);

  return {
    contentEngineAdmin: {
      token,
      enabled: Boolean(token),
    },
    contentEngineBackfill: {
      worker: {
        // On by default, and off only when explicitly disabled. A queue whose
        // consumer has to be remembered is not a background job — an
        // admin-triggered rollout would sit queued until somebody ran a script.
        // Scripts that boot an application context set this to "false" so they
        // do not race the work they were started to do.
        enabled: readOptional(process.env.CONTENT_ENGINE_BACKFILL_WORKER) !== "false",
        pollMs: positiveInteger(process.env.CONTENT_ENGINE_BACKFILL_POLL_MS, 30_000),
      },
    },
  };
};
