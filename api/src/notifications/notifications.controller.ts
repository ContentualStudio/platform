import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { interval, merge, Observable } from "rxjs";
import { finalize, map } from "rxjs/operators";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  SessionGuard,
} from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import { NotificationsService } from "./notifications.service";
import {
  inAppNotificationIdSchema,
  inAppNotificationsQuerySchema,
  notificationPreferenceUpdateSchema,
  pendingInAppNotificationsQuerySchema,
} from "./notifications.schemas";
import { NotificationsRealtimeBus } from "./notifications-realtime.bus";
import {
  NotificationInputError,
  NotificationNotFoundError,
} from "./notifications.service";

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly realtimeBus?: NotificationsRealtimeBus,
  ) {}

  @Get("preferences")
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user);
  }

  @Patch("preferences")
  async setPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      notificationPreferenceUpdateSchema,
      body,
      "INVALID_NOTIFICATION_PREFERENCE",
      "The notification preference is invalid.",
    );

    return this.notificationsService.setPreference(user, payload);
  }

  @Get("in-app")
  async getInAppNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    const payload = parseWithSchema(
      inAppNotificationsQuerySchema,
      query,
      "INVALID_NOTIFICATION_QUERY",
      "The notification query is invalid.",
    );

    return this.notificationsService.listInAppNotifications(
      user.id,
      payload.limit,
    );
  }

  @Get("in-app/pending")
  async getPendingInAppNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    const payload = parseWithSchema(
      pendingInAppNotificationsQuerySchema,
      query,
      "INVALID_NOTIFICATION_QUERY",
      "The notification query is invalid.",
    );

    try {
      return await this.notificationsService.listPendingInAppNotifications(
        user.id,
        payload.limit,
        payload.cursor,
      );
    } catch (error) {
      this.rethrowBadRequest(error);
    }
  }

  @Patch("in-app/:id/read")
  async readInAppNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const notificationId = parseWithSchema(
      inAppNotificationIdSchema,
      id,
      "INVALID_IN_APP_NOTIFICATION_ID",
      "The notification id is invalid.",
    );

    try {
      return await this.notificationsService.markInAppNotificationRead(
        user.id,
        notificationId,
      );
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  @Post("in-app/read-all")
  async readAllInAppNotifications(@CurrentUser() user: AuthenticatedUser) {
    try {
      return await this.notificationsService.markAllInAppNotificationsRead(user.id);
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  @Delete("in-app/:id")
  async dismissInAppNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const notificationId = parseWithSchema(
      inAppNotificationIdSchema,
      id,
      "INVALID_IN_APP_NOTIFICATION_ID",
      "The notification id is invalid.",
    );

    try {
      return await this.notificationsService.dismissInAppNotification(
        user.id,
        notificationId,
      );
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  @Sse("in-app/stream")
  streamInAppNotifications(
    @CurrentUser() user: AuthenticatedUser,
  ): Observable<MessageEvent> {
    if (!this.realtimeBus) {
      throw new Error("Notifications realtime bus is unavailable.");
    }

    const events = this.realtimeBus.subscribe(user.id).pipe(
      map((event) => ({
        type: event.type,
        data: JSON.stringify(event),
      })),
    );
    const heartbeat = interval(25_000).pipe(
      map(() => ({
        type: "heartbeat",
        data: JSON.stringify({ type: "heartbeat" }),
      })),
    );

    // Do not catch the bus error: merge must tear down both this heartbeat and
    // the bus subscription so an SSE client observes a closed response.
    return merge(events, heartbeat).pipe(finalize(() => undefined));
  }

  private rethrowNotFound(error: unknown): never {
    if (error instanceof NotificationNotFoundError) {
      throw new NotFoundException({
        code: error.code,
        message: error.message,
      });
    }

    throw error;
  }

  private rethrowBadRequest(error: unknown): never {
    if (error instanceof NotificationInputError) {
      throw new BadRequestException({
        code: "INVALID_NOTIFICATION_QUERY",
        message: "The notification query is invalid.",
      });
    }

    throw error;
  }
}
