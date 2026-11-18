import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { InstagramService } from "./instagram.service";

const credentialSchema = z
  .object({ credential: z.string().trim().min(1) })
  .strict();

// Internal harness, not Meta OAuth. `connect` and `follower-sync` accept a
// stub credential so the whole event path — platform.connected, snapshots,
// follower milestones — is drivable with no Meta app provisioned, which is the
// state the project is in until App Review clears.
//
// Once a real app *is* configured they are closed off: leaving them open would
// let any authenticated caller name a handle and a follower count and mint
// milestones for it. The real flow lives in InstagramOauthController.
@Controller("instagram")
@UseGuards(SessionGuard)
export class InstagramController {
  constructor(
    private readonly instagram: InstagramService,
    private readonly purge: InstagramDataPurgeService,
    private readonly config: ConfigService,
  ) {}

  @Post("connect")
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const { credential } = parseWithSchema(
      credentialSchema,
      body,
      "INVALID_INSTAGRAM_CREDENTIAL",
      "Provide an Instagram handle.",
    );

    this.assertHarnessAvailable();

    return this.instagram.connect(user.id, { credential });
  }

  // Disconnecting deletes, it does not merely unlink: the growth history, the
  // post metrics, the stored token and every follower-derived badge go with it.
  // The same cascade backs Meta's deletion callback, so both routes erase
  // exactly the same set.
  @Post("disconnect")
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.purge.purge(user.id, "disconnect");

    return { disconnected: true, tokenRevoked: result.tokenRevoked };
  }

  @Post("follower-sync")
  async followerSync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const { credential } = parseWithSchema(
      credentialSchema,
      body,
      "INVALID_INSTAGRAM_CREDENTIAL",
      "Provide an Instagram handle.",
    );

    this.assertHarnessAvailable();

    return this.instagram.syncFollowers(user.id, { credential });
  }

  private assertHarnessAvailable(): void {
    if (this.config.get<boolean>("instagram.configured")) {
      throw new BadRequestException({
        code: "INSTAGRAM_MANUAL_CONNECT_DISABLED",
        message: "Connect Instagram through the authorization flow.",
      });
    }
  }

  @Get("analytics/snapshot")
  async getAnalyticsSnapshot(@CurrentUser() user: AuthenticatedUser) {
    return this.instagram.getAnalyticsSnapshot(user.id);
  }

  @Get("analytics/growth")
  async getFollowerGrowth(@CurrentUser() user: AuthenticatedUser) {
    return this.instagram.getFollowerGrowth(user.id);
  }

  @Get("analytics/posts")
  async getPosts(@CurrentUser() user: AuthenticatedUser) {
    return this.instagram.getPosts(user.id);
  }
}
