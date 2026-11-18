import { z } from "zod";
import { proxyJsonToApi } from "@/lib/server/proxy-api";
import { defineRouteHandler } from "@/lib/server/route";
import { authCodeSchema, emailSchema } from "@/schemas/auth.schema";

const failureMessage = "We couldn't verify that code. Try again shortly.";

// proxyJsonToApi copies the api's Set-Cookie onto this response, which is how
// the admin session cookie reaches the browser on the web origin.
export const POST = defineRouteHandler({
  name: "verifyAdminCode",
  rateLimit: "auth",
  input: z.object({ email: emailSchema, code: authCodeSchema }),
  failureMessage,
  handler: (input, request) =>
    proxyJsonToApi(request, "/admin-auth/verify-code", input, failureMessage),
});
