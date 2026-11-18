import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { StudioLessonNudgesService } from "./studio-lesson-nudges.service";

@Controller("studio/lesson-nudges")
@UseGuards(SessionGuard)
export class StudioLessonNudgesController {
  constructor(private readonly nudges: StudioLessonNudgesService) {}

  @Post(":taskId")
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param("taskId") taskId: string,
  ) {
    return { nudge: await this.nudges.claimForCompletedTask(user.id, taskId) };
  }
}
