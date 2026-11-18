import { StudioLessonNudgesController } from "./studio-lesson-nudges.controller";
import { StudioLessonNudgesService } from "./studio-lesson-nudges.service";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { StudioLessonsController } from "./studio-lessons.controller";
import { StudioLessonsService } from "./studio-lessons.service";

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [StudioLessonsController, StudioLessonNudgesController],
  providers: [StudioLessonsService, StudioLessonNudgesService],
})
export class StudioModule {}
