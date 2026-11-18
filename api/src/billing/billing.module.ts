import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { BillingConfigService } from "./billing-config.service";
import { BillingController } from "./billing.controller";
import { BillingRepository } from "./billing.repository";
import { CheckoutService } from "./checkout.service";
import {
  BillingAccountEntity,
  BillingWebhookEventEntity,
  FoundingCohortEntity,
  ReferralEntity,
  UserSubscriptionEntity,
} from "./entities";
import { EntitlementService } from "./entitlement.service";
import { FoundingService } from "./founding.service";
import { PortalService } from "./portal.service";
import { PriceCatalogueService } from "./price-catalogue.service";
import { ReferralService } from "./referral.service";
import { STRIPE_GATEWAY, type StripeGateway } from "./stripe-gateway.port";
import { StripeSdkGateway } from "./stripe-sdk.gateway";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { StripeWebhookService } from "./stripe-webhook.service";
import { StubStripeGateway } from "./stub-stripe.gateway";

/** The real SDK when `billing.configured`, otherwise the refusing stub. */
export function selectStripeGateway(
  config: ConfigService,
  sdk: StripeSdkGateway,
  stub: StubStripeGateway,
): StripeGateway {
  return config.get<boolean>("billing.configured") ? sdk : stub;
}

@Module({
  imports: [
    AuthModule,
    ContentEngineModule,
    TypeOrmModule.forFeature([
      BillingAccountEntity,
      BillingWebhookEventEntity,
      FoundingCohortEntity,
      ReferralEntity,
      UserSubscriptionEntity,
    ]),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingConfigService,
    BillingRepository,
    EntitlementService,
    FoundingService,
    ReferralService,
    CheckoutService,
    PortalService,
    PriceCatalogueService,
    StripeWebhookService,
    StripeSdkGateway,
    StubStripeGateway,
    {
      provide: STRIPE_GATEWAY,
      inject: [ConfigService, StripeSdkGateway, StubStripeGateway],
      useFactory: selectStripeGateway,
    },
  ],
  exports: [
    BillingConfigService,
    BillingRepository,
    EntitlementService,
    FoundingService,
    ReferralService,
    StripeWebhookService,
    STRIPE_GATEWAY,
  ],
})
export class BillingModule {}
