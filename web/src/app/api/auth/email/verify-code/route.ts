import { proxyJsonToApi } from "@/lib/server/proxy-api";
import { defineRouteHandler } from "@/lib/server/route";
import { verifyCodeRequestSchema } from "@/schemas/auth.schema";

const failureMessage = "We couldn't verify that login code. Try again shortly.";

export const POST = defineRouteHandler({
  name: "verifyEmailCode",
  rateLimit: "auth",
  input: verifyCodeRequestSchema,
  failureMessage,
  handler: (input, request) =>
    proxyJsonToApi(
      request,
      "/auth/email/verify-code",
      input,
      failureMessage,
    ),
});
