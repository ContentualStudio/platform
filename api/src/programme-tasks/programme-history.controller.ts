import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { ProgrammeHistoryService } from "./programme-history.service";

@Controller("programmes")
@UseGuards(SessionGuard)
export class ProgrammeHistoryController {
  constructor(private readonly history: ProgrammeHistoryService) {}

  /** Every programme the caller has started, with completion %. Read-only. */
  @Get("history")
  async programmeHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.history.forUser(user);
  }
}
