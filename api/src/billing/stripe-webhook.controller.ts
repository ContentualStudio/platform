import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { StripeWebhookService } from "./stripe-webhook.service";

/**
 * Stripe calls this directly on the api host — not through the web proxy,
 * which exists to keep the session cookie first-party and has nothing to do
 * with a server-to-server call. Register
 * `https://<api-host>/billing/stripe/webhook` in the Stripe dashboard.
 *
 * Signature verification needs the bytes exactly as Stripe sent them, which
 * is why `main.ts` boots Nest with `rawBody: true`.
 */
@Controller("billing/stripe")
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ) {
    return this.webhooks.handle(request.rawBody, signature);
  }
}
