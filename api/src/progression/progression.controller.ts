import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { EligibleProgrammesService } from "./eligible-programmes.service";
import { ProgrammeSuggestionService } from "./programme-suggestion.service";
import { ProgressionService } from "./progression.service";

@Controller("programmes")
@UseGuards(SessionGuard)
export class ProgressionController {
  constructor(
    private readonly progression: ProgressionService,
    private readonly eligible: EligibleProgrammesService,
    private readonly suggestions: ProgrammeSuggestionService,
  ) {}

  // Every programme the caller may start. Reads only — appearing in this list
  // is an offer, never an enrolment.
  @Get("eligible")
  async listEligible(@CurrentUser() user: AuthenticatedUser) {
    return this.eligible.listForUser(user);
  }

  // Clears the newly-unlocked treatment. Separate from the read so opening the
  // list is not a write, and so a prefetch cannot silently mark unlocks seen.
  @Post("eligible/seen")
  async markEligibleSeen(@CurrentUser() user: AuthenticatedUser) {
    await this.eligible.markSeen(user);
    return { seen: true };
  }

  // The one programme the dashboard invites the caller to start, or null.
  // Reading it never enrols; starting goes through the Welcome Page.
  @Get("suggestion")
  async activeSuggestion(@CurrentUser() user: AuthenticatedUser) {
    return this.suggestions.activeForUser(user);
  }

  @Post("suggestion/:id/dismiss")
  async dismissSuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    await this.suggestions.dismiss(user, id);
    return { dismissed: true };
  }

  // Idempotent, mirroring POST /challenge-setup/begin: safe to call more than
  // once.
  @Post("complete")
  async complete(@CurrentUser() user: AuthenticatedUser) {
    return this.progression.completeProgramme(user);
  }
}
