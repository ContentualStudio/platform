import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { ChallengeSetupService } from "./challenge-setup.service";

/**
 * Per-programme Welcome Page and start, by slug. The eligible-programmes list
 * links here; the server re-checks eligibility on start whatever the UI showed.
 */
@Controller("programmes")
@UseGuards(SessionGuard)
export class ProgrammeStartController {
  constructor(private readonly setupService: ChallengeSetupService) {}

  @Get(":slug/welcome")
  async welcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param("slug") slug: string,
  ) {
    return this.setupService.getProgrammeWelcome(user, slug);
  }

  @Post(":slug/start")
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param("slug") slug: string,
  ) {
    return this.setupService.startProgrammeBySlug(user, slug);
  }
}
