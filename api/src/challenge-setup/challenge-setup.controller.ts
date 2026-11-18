import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { productEventTokens } from "../observability/product-events";
import { stage2PartialAnswersSchema } from "./challenge-setup.schemas";
import { ChallengeSetupService } from "./challenge-setup.service";

@Controller("challenge-setup")
@UseGuards(SessionGuard)
export class ChallengeSetupController {
  constructor(
    private readonly setupService: ChallengeSetupService,
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics,
  ) {}

  @Get("me")
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.setupService.getStatus(user);
  }

  @Post("stage2")
  async saveStage2(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      stage2PartialAnswersSchema,
      body,
      "INVALID_STAGE2_PAYLOAD",
      "The setup answers are invalid.",
    );

    const status = await this.setupService.saveStage2Answers(user, payload);

    // Which questions were answered, never the answers. The point is drop-off:
    // where in the questionnaire people stop. The answers themselves are profile
    // data and have no business in an analytics pipeline.
    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.onboardingStage2Saved,
      properties: { answered: Object.keys(payload).sort() },
    });

    return status;
  }

  @Post("complete")
  async completeStage2(@CurrentUser() user: AuthenticatedUser) {
    const status = await this.setupService.completeStage2(user);

    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.onboardingStage2Completed,
      properties: { programmeId: status.assignedProgramme?.id ?? null },
    });

    return status;
  }

  // Authored content for the user's assigned programme, driving the Welcome
  // Page. A dedicated endpoint (rather than folding into /me) gives the client
  // a real fetch to hang loading / error+retry states off of. Reads only the
  // content mirror — never Payload on the hot path.
  @Get("welcome")
  async getWelcome(@CurrentUser() user: AuthenticatedUser) {
    return this.setupService.getWelcomeContent(user);
  }

  // "Begin Programme". Idempotent: safe to call more than once.
  //
  // `instagramConnected` stays a questionnaire answer here, deliberately: it
  // feeds programme matching, and is not the same fact as a live platform
  // connection, which the Instagram module owns end to end. The Stage 2 step no
  // longer sets it on the user's say-so, though — it authorises for real and
  // records the answer only on a successful return.
  @Post("begin")
  async begin(@CurrentUser() user: AuthenticatedUser) {
    return this.setupService.beginProgramme(user);
  }
}
