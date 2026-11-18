import { cache } from "react";
import { serverApiGet } from "@/lib/api-client";
import {
  instagramConnectionResponseSchema,
  type InstagramConnectionResponse,
} from "@/lib/instagram-connection";

// The platforms screen and the settings panel both need the connection, and
// both render on the server. Cached per request, the same way the profile and
// the analytics snapshot are, so rendering both costs one api call.
export const getInstagramConnectionServer = cache(
  async (): Promise<InstagramConnectionResponse | null> =>
    serverApiGet("/instagram/connection", instagramConnectionResponseSchema),
);
