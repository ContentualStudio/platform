import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { CurrentProgrammeService } from "./current-programme.service";

@Controller("programmes")
@UseGuards(SessionGuard)
export class CurrentProgrammeController {
  constructor(private readonly current: CurrentProgrammeService) {}

  /**
   * What the caller is doing now, or null between programmes.
   *
   * Null is a 200 with a null body rather than a 404: "you have no current
   * programme" is a state every programme-aware surface renders, not an error
   * it has to recover from.
   */
  @Get("current")
  async currentProgramme(@CurrentUser() user: AuthenticatedUser) {
    const current = await this.current.forUser(user);

    if (!current) {
      return null;
    }

    return {
      slug: current.slug,
      // The journey's own anchor and duration, so a second programme counts
      // from its own day 1 rather than inheriting the first one's.
      day1ScheduledFor: current.day1ScheduledFor,
      durationDays: current.durationDays,
      currentDay: current.currentDay,
      startedAt: current.startedAt.toISOString(),
      // The whole authored programme, in the same shape every other surface
      // already renders, so no caller has to reassemble one.
      programme: current.programme,
      // Mirror identity for CMS-relationship matching (Studio For-you reads
      // a lesson's programmeRelevance, which carries source document ids).
      programmeSourceId: current.programmeSourceId,
    };
  }
}
