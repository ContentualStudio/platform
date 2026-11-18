import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProgrammeContentModule } from "../challenge-setup/programmes/programme-content.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { GamificationModule } from "../gamification/gamification.module";
import { ProgrammeEnrolmentModule } from "../programme-enrolment/programme-enrolment.module";
import { ProgrammeHistoryController } from "./programme-history.controller";
import { ProgrammeHistoryService } from "./programme-history.service";
import { ProgrammeTaskController } from "./programme-task.controller";
import { ProgrammeTaskService } from "./programme-task.service";
import { UpcomingTasksService } from "./upcoming-tasks.service";

@Module({
  imports: [
    AuthModule,
    ContentEngineModule,
    GamificationModule,
    ProgrammeContentModule,
    ProgrammeEnrolmentModule,
  ],
  controllers: [ProgrammeTaskController, ProgrammeHistoryController],
  providers: [ProgrammeTaskService, UpcomingTasksService, ProgrammeHistoryService],
  // The admin user view shows a user's history exactly as they see it.
  exports: [ProgrammeHistoryService],
})
export class ProgrammeTasksModule {}
