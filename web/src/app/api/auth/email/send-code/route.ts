import { proxyJsonToApi } from "@/lib/server/proxy-api";
import { defineRouteHandler } from "@/lib/server/route";
import { sendCodeRequestSchema } from "@/schemas/auth.schema";

const failureMessage = "We couldn't send a login code. Try again shortly.";

export const POST = defineRouteHandler({
  name: "sendEmailCode",
  rateLimit: "auth",
  input: sendCodeRequestSchema,
  failureMessage,
  handler: (input, request) =>
    proxyJsonToApi(request, "/auth/email/send-code", input, failureMessage),
});
