import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BadgeCelebrationService } from "./badge-celebration.service";
import { BadgeCooldownProcessor } from "./badge-cooldown.processor";
import { BadgeCooldownWorker } from "./badge-cooldown.worker";
import { GamificationController } from "./gamification.controller";
import { GamificationService } from "./gamification.service";
import { UserAchievementsService } from "./user-achievements.service";

@Module({
  imports: [AuthModule, ContentEngineModule, NotificationsModule],
  controllers: [GamificationController],
  providers: [
    GamificationService,
    BadgeCooldownProcessor,
    BadgeCooldownWorker,
    BadgeCelebrationService,
    UserAchievementsService,
  ],
  exports: [GamificationService],
})
export class GamificationModule {}
