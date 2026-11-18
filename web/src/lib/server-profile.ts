import { cache } from "react";
import { serverApiGet } from "@/lib/api-client";
import {
  profileResponseSchema,
  type ProfileResponse,
} from "@/schemas/onboarding.schema";

// Wrapped in React's cache() so the layout and the page it renders both
// resolve to the same in-flight request instead of hitting the api twice
// per navigation.
export const getProfileServer = cache(
  async (): Promise<ProfileResponse | null> =>
    serverApiGet("/profile/me", profileResponseSchema),
);
