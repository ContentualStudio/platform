import { cache } from "react";
import {
  analyticsSnapshotResponseSchema,
  type AnalyticsSnapshotResponse,
} from "@/lib/analytics-snapshot";
import { serverApiGet } from "@/lib/api-client";

// Settings renders the linked-accounts and journey panels on the server, so the
// snapshot is read the same way as the profile rather than through the client
// service in services/analytics-snapshot.service.ts.
export const getAnalyticsSnapshotServer = cache(
  async (): Promise<AnalyticsSnapshotResponse | null> =>
    serverApiGet(
      "/instagram/analytics/snapshot",
      analyticsSnapshotResponseSchema,
    ),
);
