import { defineRouteHandler } from "@/lib/server/route";

export const GET = defineRouteHandler({
  name: "health",
  failureMessage: "The health check failed.",
  handler: () => ({ ok: true, service: "web" }),
});
