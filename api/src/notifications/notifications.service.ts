import { Inject, Injectable, Optional } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  IsNull,
  Repository,
} from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { InAppNotificationEntity } from "./entities/in-app-notification.entity";
import { NotificationPreferenceEntity } from "./entities/notification-preference.entity";
import { isSafeInternalActionUrl } from "./internal-action-url";
import type {
  CreateInAppNotificationInput,
  DismissInAppNotificationResponse,
  InAppNotificationMutationResponse,
  InAppNotificationView,
  InAppNotificationsResponse,
  PendingInAppNotificationsResponse,
  NotificationsRealtimePublisher,
} from "./in-app-notification.types";
import { NOTIFICATIONS_REALTIME_PUBLISHER } from "./in-app-notification.types";
import {
  decodePendingInAppNotificationCursor,
  encodePendingInAppNotificationCursor,
} from "./in-app-notification.types";
import {
  accountCriticalEmailTypes,
  channelLabel,
  getNotificationRegistry,
  notificationRegistry,
  type NotificationChannel,
  type NotificationType,
} from "./notification-registry";
import type { NotificationPreferenceUpdate } from "./notifications.schemas";

export class NotificationPreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationPreferenceError";
  }
}

export class NotificationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationInputError";
  }
}

export class NotificationNotFoundError extends Error {
  readonly code = "NOTIFICATION_NOT_FOUND";

  constructor() {
    super("The notification was not found.");
    this.name = "NotificationNotFoundError";
  }
}

export interface NotificationPreferenceChannelView {
  readonly channel: NotificationChannel;
  readonly label: string;
  readonly optedOut: boolean;
  readonly defaultOptedOut: boolean;
}

export interface NotificationPreferenceView {
  readonly type: NotificationType;
  readonly label: string;
  readonly description: string;
  readonly channels: readonly NotificationPreferenceChannelView[];
}

export interface NotificationPreferencesResponse {
  readonly preferences: readonly NotificationPreferenceView[];
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferenceRepository: Repository<NotificationPreferenceEntity>,
    @Optional()
    @InjectRepository(InAppNotificationEntity)
    private readonly notificationRepository?: Repository<InAppNotificationEntity>,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
    @Optional()
    @Inject(NOTIFICATIONS_REALTIME_PUBLISHER)
    private readonly realtimePublisher?: NotificationsRealtimePublisher,
  ) {}

  async getPreferences(
    user: Pick<AuthenticatedUser, "id">,
  ): Promise<NotificationPreferencesResponse> {
    const rows = await this.preferenceRepository.find({
      where: { userId: user.id },
    });
    const values = new Map(
      rows.map((row) => [
        this.preferenceKey(row.notificationType, row.channel),
        row.optedOut,
      ]),
    );

    return {
      preferences: getNotificationRegistry().map((definition) => ({
        type: definition.type,
        label: definition.label,
        description: definition.description,
        channels: definition.channels.map(({ channel, label }) => ({
          channel,
          label,
          optedOut:
            values.get(this.preferenceKey(definition.type, channel)) ??
            definition.defaultOptedOut,
          defaultOptedOut: definition.defaultOptedOut,
        })),
      })),
    };
  }

  async setPreference(
    user: Pick<AuthenticatedUser, "id">,
    input: NotificationPreferenceUpdate,
  ): Promise<NotificationPreferencesResponse> {
    this.assertChannelConfigured(input.notificationType, input.channel);

    await this.preferenceRepository.upsert(
      {
        userId: user.id,
        notificationType: input.notificationType,
        channel: input.channel,
        optedOut: input.optedOut,
      },
      ["userId", "notificationType", "channel"],
    );

    return this.getPreferences(user);
  }

  /**
   * The only product-notification delivery decision point. Delivery adapters
   * should ask this method immediately before sending on a channel.
   */
  async isDeliveryAllowed(
    user: Pick<AuthenticatedUser, "id">,
    notificationType: string,
    channel: NotificationChannel,
  ): Promise<boolean> {
    if (
      channel === "email" &&
      accountCriticalEmailTypes.has(notificationType)
    ) {
      return true;
    }

    if (!(notificationType in notificationRegistry)) {
      throw new NotificationPreferenceError(
        `Notification type ${notificationType} is not registered.`,
      );
    }

    const type = notificationType as NotificationType;
    const definition = notificationRegistry[type];
    this.assertChannelConfigured(type, channel);

    const rows = await this.preferenceRepository.find({
      where: { userId: user.id },
    });
    const saved = rows.find(
      (row) =>
        row.notificationType === type && row.channel === channel,
    );

    return !(saved?.optedOut ?? definition.defaultOptedOut);
  }

  async createInAppNotification(
    manager: EntityManager,
    input: CreateInAppNotificationInput,
  ): Promise<InAppNotificationView | null> {
    this.assertCreateInput(input);
    await this.lockInboxForUser(manager, input.userId);

    if (
      input.notificationType !== null &&
      !(await this.isDeliveryAllowedWithManager(
        manager,
        input.userId,
        input.notificationType,
        "in_app",
      ))
    ) {
      return null;
    }

    const returned = (await manager.query(
      `INSERT INTO "in_app_notification"
         ("userId", "notificationType", "title", "message", "actionUrl", "dedupeKey",
          "sourceEngineMessageId", "sourceRuleId", "sourceEventId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ("userId", "dedupeKey") DO NOTHING
       RETURNING "id", "userId", "notificationType", "title", "message", "actionUrl",
                 "createdAt", "readAt", "dismissedAt"`,
      [
        input.userId,
        input.notificationType,
        input.title,
        input.message,
        input.actionUrl ?? null,
        input.dedupeKey,
        input.sourceEngineMessageId ?? null,
        input.sourceRuleId ?? null,
        input.sourceEventId ?? null,
      ],
    )) as InAppNotificationEntity[];

    const row = returned[0];

    // A conflict is a replay, not a new delivery. Returning before the count
    // and publisher is what keeps retries from producing duplicate envelopes.
    if (!row) {
      return null;
    }

    const unreadCount = await this.countUnread(manager, input.userId);
    const notification = this.toView(row);
    await this.publisher().enqueue(manager, input.userId, {
      type: "notification.created",
      notification,
      unreadCount,
    });

    return notification;
  }

  async listInAppNotifications(
    userId: string,
    limit: number,
  ): Promise<InAppNotificationsResponse> {
    const repository = this.inboxRepository();
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await repository.find({
      where: { userId, dismissedAt: IsNull() },
      order: { createdAt: "DESC", id: "DESC" },
      take: safeLimit,
    });
    const unreadCount = await repository.count({
      where: { userId, dismissedAt: IsNull(), readAt: IsNull() },
    });

    return {
      notifications: rows.map((row) => this.toView(row)),
      unreadCount,
    };
  }

  async listPendingInAppNotifications(
    userId: string,
    limit: number,
    cursor?: string | null,
  ): Promise<PendingInAppNotificationsResponse> {
    if (cursor === null) {
      return {
        notifications: [],
        nextCursor: null,
      };
    }

    const repository = this.inboxRepository();
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const decodedCursor =
      cursor === undefined
        ? null
        : this.parsePendingInAppNotificationCursor(cursor);
    const query = repository
      .createQueryBuilder("notification")
      .where(`notification."userId" = :userId`, { userId })
      .andWhere(`notification."dismissedAt" IS NULL`)
      .andWhere(`notification."readAt" IS NULL`)
      .orderBy(`notification."createdAt"`, "ASC")
      .addOrderBy(`notification."id"`, "ASC")
      .take(safeLimit + 1);

    if (decodedCursor !== null) {
      query.andWhere(
        `(notification."createdAt" > :cursorCreatedAt OR (notification."createdAt" = :cursorCreatedAt AND notification."id" > :cursorId))`,
        {
          cursorCreatedAt: decodedCursor.createdAt,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rows = await query.getMany();
    const pageRows = rows.slice(0, safeLimit);
    const nextCursor =
      rows.length > safeLimit
        ? encodePendingInAppNotificationCursor({
            createdAt: pageRows[pageRows.length - 1]!.createdAt,
            id: String(pageRows[pageRows.length - 1]!.id),
          })
        : null;

    return {
      notifications: pageRows.map((row) => this.toView(row)),
      nextCursor,
    };
  }

  async markInAppNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<InAppNotificationMutationResponse> {
    return this.transaction(async (manager) => {
      await this.lockInboxForUser(manager, userId);
      const repository = manager.getRepository(InAppNotificationEntity);
      const row = await repository.findOne({
        where: { id: notificationId, userId, dismissedAt: IsNull() },
      });

      if (!row) {
        throw new NotificationNotFoundError();
      }

      if (row.readAt === null) {
        await repository.update(
          { id: notificationId, userId },
          { readAt: new Date() },
        );
        row.readAt = new Date();
      }

      const notification = this.toView(row);
      const unreadCount = await this.countUnread(manager, userId);
      await this.publisher().enqueue(manager, userId, {
        type: "notification.updated",
        notification,
        unreadCount,
      });

      return { notification, unreadCount };
    });
  }

  async markAllInAppNotificationsRead(
    userId: string,
  ): Promise<InAppNotificationsResponse> {
    return this.transaction(async (manager) => {
      await this.lockInboxForUser(manager, userId);
      const repository = manager.getRepository(InAppNotificationEntity);
      await repository.update(
        { userId, dismissedAt: IsNull(), readAt: IsNull() },
        { readAt: new Date() },
      );

      const response = await this.listWithManager(manager, userId, 50);
      await this.publisher().enqueue(manager, userId, {
        type: "notifications.read_all",
        unreadCount: 0,
      });

      return response;
    });
  }

  async dismissInAppNotification(
    userId: string,
    notificationId: string,
  ): Promise<DismissInAppNotificationResponse> {
    return this.transaction(async (manager) => {
      await this.lockInboxForUser(manager, userId);
      const repository = manager.getRepository(InAppNotificationEntity);
      const row = await repository.findOne({
        where: { id: notificationId, userId, dismissedAt: IsNull() },
      });

      if (!row) {
        throw new NotificationNotFoundError();
      }

      await repository.update(
        { id: notificationId, userId },
        { dismissedAt: new Date() },
      );
      const unreadCount = await this.countUnread(manager, userId);
      await this.publisher().enqueue(manager, userId, {
        type: "notification.dismissed",
        notificationId,
        unreadCount,
      });

      return { notificationId, unreadCount };
    });
  }

  private async isDeliveryAllowedWithManager(
    manager: EntityManager,
    userId: string,
    notificationType: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const definition = notificationRegistry[notificationType];
    this.assertChannelConfigured(notificationType, channel);

    const rows = await manager.find(NotificationPreferenceEntity, {
      where: { userId },
    });
    const saved = rows.find(
      (row) =>
        row.notificationType === notificationType && row.channel === channel,
    );

    return !(saved?.optedOut ?? definition.defaultOptedOut);
  }

  private async countUnread(
    manager: EntityManager,
    userId: string,
  ): Promise<number> {
    const rows = (await manager.query(
      `SELECT COUNT(*)::int AS "count"
         FROM "in_app_notification"
        WHERE "userId" = $1
          AND "dismissedAt" IS NULL
          AND "readAt" IS NULL`,
      [userId],
    )) as Array<{ count: number | string }>;

    return Number(rows[0]?.count ?? 0);
  }

  private async listWithManager(
    manager: EntityManager,
    userId: string,
    limit: number,
  ): Promise<InAppNotificationsResponse> {
    const repository = manager.getRepository(InAppNotificationEntity);
    const rows = await repository.find({
      where: { userId, dismissedAt: IsNull() },
      order: { createdAt: "DESC", id: "DESC" },
      take: limit,
    });

    return {
      notifications: rows.map((row) => this.toView(row)),
      unreadCount: await this.countUnread(manager, userId),
    };
  }

  private async lockInboxForUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [userId],
    );
  }

  private assertChannelConfigured(
    notificationType: NotificationType,
    channel: NotificationChannel,
  ): void {
    const definition = notificationRegistry[notificationType];
    const configuredChannels = definition.channels as readonly NotificationChannel[];

    if (configuredChannels.includes(channel)) {
      return;
    }

    throw new NotificationPreferenceError(
      `${channelLabel(channel)} is not available for ${definition.label.toLowerCase()} notifications.`,
    );
  }

  private async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!this.dataSource) {
      throw new Error("NotificationsService inbox dependencies are unavailable.");
    }

    return this.dataSource.transaction(work);
  }

  private inboxRepository(): Repository<InAppNotificationEntity> {
    if (!this.notificationRepository) {
      throw new Error("NotificationsService inbox dependencies are unavailable.");
    }

    return this.notificationRepository;
  }

  private publisher(): NotificationsRealtimePublisher {
    if (!this.realtimePublisher) {
      throw new Error("NotificationsService realtime publisher is unavailable.");
    }

    return this.realtimePublisher;
  }

  private assertCreateInput(input: CreateInAppNotificationInput): void {
    for (const [name, value] of [
      ["title", input.title],
      ["message", input.message],
      ["dedupeKey", input.dedupeKey],
    ] as const) {
      if (!value.trim()) {
        throw new NotificationInputError(`${name} must not be blank.`);
      }
    }

    if (input.actionUrl !== undefined && input.actionUrl !== null) {
      if (!isSafeInternalActionUrl(input.actionUrl)) {
        throw new NotificationInputError("The notification action URL is invalid.");
      }
    }
  }

  private parsePendingInAppNotificationCursor(cursor: string) {
    try {
      return decodePendingInAppNotificationCursor(cursor);
    } catch {
      throw new NotificationInputError("The notification cursor is invalid.");
    }
  }

  private toView(row: InAppNotificationEntity): InAppNotificationView {
    return {
      id: String(row.id),
      type: row.notificationType,
      title: row.title,
      description: row.message,
      actionUrl: row.actionUrl,
      read: row.readAt !== null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private preferenceKey(
    notificationType: NotificationType,
    channel: NotificationChannel,
  ) {
    return `${notificationType}:${channel}`;
  }
}
