import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { InAppNotificationEntity } from "./entities/in-app-notification.entity";
import { NotificationPreferenceEntity } from "./entities/notification-preference.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsRealtimeBus } from "./notifications-realtime.bus";
import { NotificationsService } from "./notifications.service";
import { NOTIFICATIONS_REALTIME_PUBLISHER } from "./in-app-notification.types";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      NotificationPreferenceEntity,
      InAppNotificationEntity,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRealtimeBus,
    {
      provide: NOTIFICATIONS_REALTIME_PUBLISHER,
      useExisting: NotificationsRealtimeBus,
    },
  ],
  exports: [NotificationsService, NotificationsRealtimeBus],
})
export class NotificationsModule {}
