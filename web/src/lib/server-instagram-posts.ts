import { cache } from "react";
import { serverApiGetOrThrow } from "@/lib/api-client";
import { instagramPostsResponseSchema } from "@/lib/instagram-posts";

/** The analytics posts lists; throws on a failed read (see RetryBoundary). */
export const getInstagramPostsServer = cache(() =>
  serverApiGetOrThrow(
    "/instagram/analytics/posts",
    instagramPostsResponseSchema,
    "We couldn't load your posts. Please try again.",
  ),
);
