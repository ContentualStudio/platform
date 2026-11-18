import { apiFetch } from "@/lib/api-client";
import {
  pendingBadgeCelebrationsSchema,
  type BadgeCelebration,
} from "@/lib/badge-celebrations";

export async function fetchPendingBadgeCelebrations(): Promise<BadgeCelebration[]> {
  const result = await apiFetch("/gamification/badges/celebrations");

  if (!result.response.ok) {
    throw new Error("Could not load badge celebrations.");
  }

  return pendingBadgeCelebrationsSchema.parse(result.rawPayload).celebrations;
}

export async function markBadgeCelebrationShown(id: string): Promise<void> {
  const result = await apiFetch(
    `/gamification/badges/celebrations/${encodeURIComponent(id)}/shown`,
    { method: "POST" },
  );

  if (!result.response.ok) {
    throw new Error("Could not record the badge celebration.");
  }
}
