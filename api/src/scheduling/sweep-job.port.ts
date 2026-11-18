/**
 * A unit of per-user work that should happen once a day, at roughly 7am in the
 * user's own timezone.
 *
 * Deliberately tiny. The dispatcher owns the hard parts — when a user's local
 * morning is, claiming safely across replicas, not running twice — and a job
 * owns only what it does. That is what lets the 7am notification and the
 * Instagram pull share one scheduler instead of growing two.
 */
export interface SweepJob {
  /** Stable identifier; part of the once-per-day key, so it must not change. */
  readonly name: string;

  /**
   * A SQL fragment naming which users this job serves, referencing the
   * `user_profile` alias `p`. Kept as a fragment rather than a callback so the
   * enqueue stays one statement rather than a query per user.
   *
   * It is a build-time constant, never caller input.
   */
  readonly scopeSql: string;

  /**
   * Does the work for one user.
   *
   * Throwing marks this user's run failed and leaves everyone else's alone.
   * Returning "skipped" records that the user was legitimately not served —
   * consent withdrawn, connection gone — which is not a failure to retry.
   */
  run(userId: string, localDate: string): Promise<"succeeded" | "skipped">;
}

export const SWEEP_JOBS = Symbol("SWEEP_JOBS");
