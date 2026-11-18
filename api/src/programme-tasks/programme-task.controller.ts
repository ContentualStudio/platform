import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { ProgrammeTaskService } from "./programme-task.service";
import { UpcomingTasksService } from "./upcoming-tasks.service";

@Controller("programme-tasks")
@UseGuards(SessionGuard)
export class ProgrammeTaskController {
  constructor(
    private readonly taskService: ProgrammeTaskService,
    private readonly upcomingTasks: UpcomingTasksService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.taskService.listTasks(user);
  }

  // Declared ahead of the ":taskId" routes so "progress" is never read as an id.
  @Get("progress")
  async progress(@CurrentUser() user: AuthenticatedUser) {
    return this.taskService.listProgress(user);
  }

  // Also ahead of ":taskId", for the same reason as "progress".
  @Get("upcoming")
  async upcoming(@CurrentUser() user: AuthenticatedUser) {
    return this.upcomingTasks.listUpcoming(user);
  }

  // Read-only preview of one upcoming day. No complete/skip lives here.
  @Get("upcoming/:dayNumber")
  async upcomingDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param("dayNumber", ParseIntPipe) dayNumber: number,
  ) {
    return this.upcomingTasks.findUpcomingDay(user, dayNumber);
  }

  @Post(":taskId/complete")
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("taskId") taskId: string,
  ) {
    return this.taskService.completeTask(user, taskId);
  }

  @Post(":taskId/skip")
  async skip(
    @CurrentUser() user: AuthenticatedUser,
    @Param("taskId") taskId: string,
  ) {
    return this.taskService.skipTask(user, taskId);
  }
}
