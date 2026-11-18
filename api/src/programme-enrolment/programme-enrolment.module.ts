import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProgrammeContentModule } from "../challenge-setup/programmes/programme-content.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CurrentProgrammeController } from "./current-programme.controller";
import { CurrentProgrammeService } from "./current-programme.service";
import { DailyTaskNoticeService } from "./daily-task-notice.service";
import { ProgrammeDayServeEntity } from "./entities/programme-day-serve.entity";
import { ProgrammeEnrolmentEntity } from "./entities/programme-enrolment.entity";
import { ProgrammeDayServeJob } from "./programme-day-serve.job";
import { ProgrammeEnrolmentService } from "./programme-enrolment.service";

@Module({
  imports: [
    AuthModule,
    ProgrammeContentModule,
    NotificationsModule,
    EmailModule,
    TypeOrmModule.forFeature([
      ProgrammeEnrolmentEntity,
      ProgrammeDayServeEntity,
    ]),
  ],
  controllers: [CurrentProgrammeController],
  providers: [
    ProgrammeEnrolmentService,
    ProgrammeDayServeJob,
    DailyTaskNoticeService,
    CurrentProgrammeService,
  ],
  exports: [
    ProgrammeEnrolmentService,
    ProgrammeDayServeJob,
    DailyTaskNoticeService,
    CurrentProgrammeService,
  ],
})
export class ProgrammeEnrolmentModule {}
