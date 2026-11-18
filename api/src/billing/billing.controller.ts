import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import { checkoutRequestSchema, referralAttachSchema } from "./billing.schemas";
import { CheckoutService } from "./checkout.service";
import { EntitlementService } from "./entitlement.service";
import { PortalService } from "./portal.service";
import { PriceCatalogueService } from "./price-catalogue.service";
import { ReferralService } from "./referral.service";

@Controller("billing")
export class BillingController {
  constructor(
    private readonly catalogue: PriceCatalogueService,
    private readonly entitlements: EntitlementService,
    private readonly checkout: CheckoutService,
    private readonly portal: PortalService,
    private readonly referral: ReferralService,
  ) {}

  // Public: the landing page renders the pricing table before sign-up. No
  // price id leaves the server — only display names, entitlements and the
  // live amount Stripe reports.
  @Get("tiers")
  async tiers() {
    return this.catalogue.catalogue();
  }

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [entitlements, referral] = await Promise.all([
      this.entitlements.resolve(user.id),
      this.referral.summaryFor(user),
    ]);

    return { entitlements, referral };
  }

  @Post("checkout")
  @UseGuards(SessionGuard)
  async startCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      checkoutRequestSchema,
      body,
      "INVALID_CHECKOUT_REQUEST",
      "Choose a plan to upgrade to.",
    );

    return this.checkout.start(user, payload.tier);
  }

  @Post("portal")
  @UseGuards(SessionGuard)
  async openPortal(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.createSession(user);
  }

  @Post("referral/attach")
  @UseGuards(SessionGuard)
  async attachReferral(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      referralAttachSchema,
      body,
      "INVALID_REFERRAL_CODE",
      "That referral code is not valid.",
    );

    return this.referral.attach(user, payload.code);
  }
}
