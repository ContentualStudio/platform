import { z } from "zod";
import { proxyJsonToApi } from "@/lib/server/proxy-api";
import { defineRouteHandler } from "@/lib/server/route";
import { emailSchema } from "@/schemas/auth.schema";

const failureMessage = "We couldn't send a sign-in code. Try again shortly.";

// Same-origin and behind the shared "auth" limiter, like product sign-in: the
// api answers whether an email is an admin, so how often one client may ask
// is metered here as well as in the api.
export const POST = defineRouteHandler({
  name: "sendAdminCode",
  rateLimit: "auth",
  input: z.object({ email: emailSchema }),
  failureMessage,
  handler: (input, request) =>
    proxyJsonToApi(request, "/admin-auth/send-code", input, failureMessage),
});
