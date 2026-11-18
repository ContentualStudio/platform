import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Client, Notification } from "pg";
import { Observable, Subject } from "rxjs";
import { ConfigService } from "@nestjs/config";
import { DataSource, EntityManager } from "typeorm";
import { InAppNotificationEntity } from "./entities/in-app-notification.entity";
import type {
  InAppNotificationStreamEvent,
  InAppNotificationView,
  NotificationsRealtimePublisher,
} from "./in-app-notification.types";

const CHANNEL = "contentual_in_app_notifications";

type EnvelopeType = InAppNotificationStreamEvent["type"];

interface NotificationEnvelope {
  readonly userId: string;
  readonly type: EnvelopeType;
  readonly notificationId?: string;
  readonly unreadCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope(payload: string): NotificationEnvelope | null {
  let value: unknown;

  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const userId = value.userId;
  const type = value.type;
  const unreadCountValue = value.unreadCount;

  if (
    typeof userId !== "string" ||
    typeof type !== "string" ||
    typeof unreadCountValue !== "number" ||
    !Number.isInteger(unreadCountValue) ||
    unreadCountValue < 0
  ) {
    return null;
  }

  if (
    type !== "notification.created" &&
    type !== "notification.updated" &&
    type !== "notification.dismissed" &&
    type !== "notifications.read_all" &&
    type !== "heartbeat"
  ) {
    return null;
  }

  if (
    (type === "notification.created" || type === "notification.updated" || type === "notification.dismissed") &&
    typeof value.notificationId !== "string"
  ) {
    return null;
  }

  if (type === "notifications.read_all" && unreadCountValue !== 0) {
    return null;
  }

  return {
    userId,
    type: type as EnvelopeType,
    notificationId:
      typeof value.notificationId === "string"
        ? value.notificationId
        : undefined,
    unreadCount: unreadCountValue,
  };
}

function notificationIdForEvent(
  event: InAppNotificationStreamEvent,
): string | undefined {
  switch (event.type) {
    case "notification.created":
    case "notification.updated":
      return event.notification.id;
    case "notification.dismissed":
      return event.notificationId;
    default:
      return undefined;
  }
}

export class NotificationsRealtimeListenerError extends Error {
  readonly causeError: unknown;

  constructor(cause: unknown) {
    super("The realtime notification listener failed.");
    this.name = "NotificationsRealtimeListenerError";
    this.causeError = cause;
  }
}

@Injectable()
export class NotificationsRealtimeBus
  implements
    NotificationsRealtimePublisher,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsRealtimeBus.name);
  private readonly subscribers = new Map<
    string,
    Set<Subject<InAppNotificationStreamEvent>>
  >();
  private processingQueue = Promise.resolve();
  private client?: Client;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private connecting = false;
  private shuttingDown = false;
  // The browser must not receive a heartbeat-only stream while PostgreSQL is
  // unavailable. An outage is surfaced as an SSE error so EventSource closes
  // and retries after LISTEN has been restored.
  private listenerReady = true;
  private listenerFailure?: NotificationsRealtimeListenerError;

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectListener();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.listenerReady = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    for (const subjects of this.subscribers.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.subscribers.clear();

    const client = this.client;
    this.client = undefined;
    client?.removeAllListeners();
    await client?.end().catch(() => undefined);
  }

  async enqueue(
    manager: EntityManager,
    userId: string,
    event: InAppNotificationStreamEvent,
  ): Promise<void> {
    const notificationId = notificationIdForEvent(event);
    const envelope: NotificationEnvelope = {
      userId,
      type: event.type,
      unreadCount: event.type === "heartbeat" ? 0 : event.unreadCount,
      ...(notificationId === undefined ? {} : { notificationId }),
    };

    await manager.query(
      "SELECT pg_notify('contentual_in_app_notifications', $1)",
      [JSON.stringify(envelope)],
    );
  }

  subscribe(userId: string): Observable<InAppNotificationStreamEvent> {
    return new Observable((subscriber) => {
      if (!this.listenerReady) {
        subscriber.error(
          this.listenerFailure ??
            new NotificationsRealtimeListenerError(
              new Error("The realtime notification listener is unavailable."),
            ),
        );
        return;
      }

      const subject = new Subject<InAppNotificationStreamEvent>();
      const subjects = this.subscribers.get(userId) ?? new Set();
      subjects.add(subject);
      this.subscribers.set(userId, subjects);

      const forwarding = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });

      return () => {
        forwarding.unsubscribe();
        subject.complete();
        subjects.delete(subject);
        if (subjects.size === 0) {
          this.subscribers.delete(userId);
        }
      };
    });
  }

  private handleNotification(message: Notification): void {
    if (message.channel !== CHANNEL || !message.payload) {
      return;
    }

    const envelope = parseEnvelope(message.payload);
    if (!envelope) {
      return;
    }

    this.handleEnvelope(envelope);
  }

  private handleEnvelope(envelope: NotificationEnvelope): void {
    // PostgreSQL delivers notifications in commit order. Keep that ordering
    // through the asynchronous row lookup as well; independent awaits here
    // would let a later read/dismiss overtake an earlier create.
    this.processingQueue = this.processingQueue
      .then(() => this.processEnvelope(envelope))
      .catch((error: unknown) => {
        this.logger.error("Failed to process a notification envelope", error);
      });
  }

  private async processEnvelope(
    envelope: NotificationEnvelope,
  ): Promise<void> {
    let event: InAppNotificationStreamEvent | null = null;

    if (
      envelope.type === "notification.created" ||
      envelope.type === "notification.updated"
    ) {
      const row = await this.dataSource
        .getRepository(InAppNotificationEntity)
        .findOne({
          where: {
            id: envelope.notificationId,
            userId: envelope.userId,
          },
        });

      if (!row) {
        return;
      }

      const notification = this.toView(row);
      event = {
        type: envelope.type,
        notification,
        unreadCount: envelope.unreadCount,
      };
    } else if (envelope.type === "notification.dismissed") {
      event = {
        type: envelope.type,
        notificationId: envelope.notificationId as string,
        unreadCount: envelope.unreadCount,
      };
    } else if (envelope.type === "notifications.read_all") {
      event = { type: envelope.type, unreadCount: 0 };
    } else {
      event = { type: "heartbeat" };
    }

    if (event) {
      this.publish(envelope.userId, event);
    }
  }

  private publish(
    userId: string,
    event: InAppNotificationStreamEvent,
  ): void {
    const subjects = this.subscribers.get(userId);
    if (!subjects) {
      return;
    }

    for (const subject of [...subjects]) {
      subject.next(event);
    }
  }

  private failListener(error: unknown): void {
    if (this.shuttingDown) {
      return;
    }

    const failure = new NotificationsRealtimeListenerError(error);
    this.listenerReady = false;
    this.listenerFailure = failure;
    const subjects = [...this.subscribers.values()].flatMap((set) => [...set]);
    this.subscribers.clear();
    for (const subject of subjects) {
      subject.error(failure);
    }

    this.scheduleReconnect();
  }

  private handleClientEnd(client: Client): void {
    if (this.shuttingDown || this.client !== client) {
      return;
    }

    this.client = undefined;
    this.failListener(
      new Error("The realtime notification listener connection ended."),
    );
  }

  private subscriberCount(): number {
    return [...this.subscribers.values()].reduce(
      (count, subjects) => count + subjects.size,
      0,
    );
  }

  private async connectListener(): Promise<void> {
    if (this.shuttingDown || this.connecting || this.client) {
      return;
    }

    this.connecting = true;
    this.listenerReady = false;
    const client = new Client({
      connectionString: this.configService.getOrThrow<string>("database.url"),
      ssl: this.configService.get<boolean>("database.ssl")
        ? { rejectUnauthorized: false }
        : false,
    });
    this.client = client;
    client.on("notification", (message) => this.handleNotification(message));
    client.on("end", () => this.handleClientEnd(client));
    client.on("error", (error) => {
      if (this.client === client) {
        this.client = undefined;
        this.failListener(error);
        void client.end().catch(() => undefined);
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      if (this.client !== client) {
        return;
      }
      this.listenerReady = true;
      this.listenerFailure = undefined;
      this.reconnectAttempt = 0;
    } catch (error) {
      if (this.client === client) {
        this.client = undefined;
      }
      await client.end().catch(() => undefined);
      this.failListener(error);
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(30_000, 250 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectListener();
    }, delay);
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
}

export { CHANNEL as NOTIFICATIONS_REALTIME_CHANNEL };
