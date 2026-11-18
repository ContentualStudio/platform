import { cache } from "react";
import { serverApiGetOrThrow } from "@/lib/api-client";
import { followerGrowthResponseSchema } from "@/lib/follower-growth";

/** The growth graph's history; throws on a failed read (see RetryBoundary). */
export const getFollowerGrowthServer = cache(() =>
  serverApiGetOrThrow(
    "/instagram/analytics/growth",
    followerGrowthResponseSchema,
    "We couldn't load your growth data. Please try again.",
  ),
);
