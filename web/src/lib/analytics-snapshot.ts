import { z } from "zod";

export const analyticsSnapshotResponseSchema = z
  .object({
    connected: z.boolean(),
    // The first pull after a connect is still running. Optional so a web
    // build ahead of the api still parses the older response.
    syncing: z.boolean().default(false),
    snapshot: z
      .object({
        connectedSince: z.string().min(1),
        followerDeltaWeek: z.number().int().nullable(),
        followers: z.number().int().nonnegative(),
        // The most recent day Instagram reported account insights for. Each
        // metric is null when Instagram did not report it, never zero.
        latestDay: z
          .object({
            localDate: z.string().min(1),
            reach: z.number().int().nonnegative().nullable(),
            interactions: z.number().int().nonnegative().nullable(),
            views: z.number().int().nonnegative().nullable(),
            profileViews: z.number().int().nonnegative().nullable(),
          })
          .strict()
          .nullable(),
      })
      .nullable(),
  })
  .strict();

export type AnalyticsSnapshotResponse = z.infer<
  typeof analyticsSnapshotResponseSchema
>;

export type AnalyticsSnapshot = NonNullable<
  AnalyticsSnapshotResponse["snapshot"]
>;

export type DashboardAnalyticsState =
  | { kind: "disconnected" }
  | { kind: "no-history" }
  | { kind: "ready"; snapshot: AnalyticsSnapshot };

export function toDashboardAnalyticsState(
  response: AnalyticsSnapshotResponse,
): DashboardAnalyticsState {
  if (!response.connected) {
    return { kind: "disconnected" };
  }

  if (!response.snapshot) {
    return { kind: "no-history" };
  }

  return { kind: "ready", snapshot: response.snapshot };
}

export function formatFollowerDelta(delta: number): string {
  if (delta === 0) {
    return "No change this week";
  }

  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")} this week`;
}

/** Signed week change for the active-challenge followers card, e.g. "+200". */
export function formatFollowerHero(
  delta: number | null,
  followers: number,
): string {
  if (delta === null) {
    return followers.toLocaleString("en-US");
  }

  if (delta === 0) {
    return "0";
  }

  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")}`;
}

/** How much of the current count the week-on-week change represents, 0–100. */
export function followerDeltaShare(
  delta: number | null,
  followers: number,
): number {
  if (delta === null || followers <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((Math.abs(delta) / followers) * 100));
}
