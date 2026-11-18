import { apiFetch } from "@/lib/api-client";
import {
  analyticsSnapshotResponseSchema,
  type AnalyticsSnapshotResponse,
} from "@/lib/analytics-snapshot";

export class AnalyticsSnapshotServiceError extends Error {
  constructor(
    message: string,
    readonly code = "ANALYTICS_SNAPSHOT_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "AnalyticsSnapshotServiceError";
  }
}

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshotResponse> {
  const result = await apiFetch("/instagram/analytics/snapshot");

  if (!result.response.ok) {
    const payload = result.rawPayload as { code?: string; message?: string };

    throw new AnalyticsSnapshotServiceError(
      payload.message ?? "We couldn't load your Instagram insights.",
      payload.code,
    );
  }

  return analyticsSnapshotResponseSchema.parse(result.rawPayload);
}
