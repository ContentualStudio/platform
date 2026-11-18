import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { EntitlementService } from "../billing/entitlement.service";
import { StudioLessonsService } from "./studio-lessons.service";

@Controller("studio/lessons")
@UseGuards(SessionGuard)
export class StudioLessonsController {
  constructor(
    private readonly lessonsService: StudioLessonsService,
    private readonly entitlements: EntitlementService,
  ) {}

  // The library lists every lesson for every tier; a paid-only lesson simply
  // reports itself locked. Gating is on the body, read below.
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const entitlements = await this.entitlements.resolve(user.id);

    return this.lessonsService.listLessons(entitlements);
  }

  
  @Get(":lessonId")
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("lessonId") lessonId: string,
  ) {
    const entitlements = await this.entitlements.resolve(user.id);
    const lesson = await this.lessonsService.findLesson(lessonId, entitlements);

    if (!lesson) {
      throw new NotFoundException({
        code: "LESSON_NOT_FOUND",
        message: "That lesson could not be found.",
      });
    }

    return lesson;
  }
}
