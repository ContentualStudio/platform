import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DataSource, type EntityManager } from "typeorm";
import { AppModule } from "../app.module";
import { NotificationsService } from "../notifications/notifications.service";
import { isSafeInternalActionUrl } from "../notifications/internal-action-url";
import {
  notificationRegistry,
  notificationTypeOptions,
  type NotificationType,
} from "../notifications/notification-registry";

export interface DemoInAppNotificationArgs {
  readonly userId: string;
  readonly notificationType: NotificationType;
  readonly actionUrl?: string;
}

const descriptionByType: Record<NotificationType, string> = {
  daily_task_notice: "Your daily challenge is ready.",
  badge_earned: "You unlocked a new achievement badge.",
  streak_at_risk: "Your posting streak needs attention.",
  milestone_reached: "You reached a new growth milestone.",
};

function valueAfter(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const inline = argv.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseDemoInAppNotificationArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): DemoInAppNotificationArgs {
  const userId = env.DEMO_USER_ID?.trim();
  if (!userId) {
    throw new Error(
      "DEMO_USER_ID is required; pass the id of an existing application user.",
    );
  }

  const rawType = valueAfter(argv, "--type")?.trim();
  if (!rawType) {
    throw new Error(
      `--type is required; choose one of ${notificationTypeOptions.join(", ")}.`,
    );
  }

  if (!notificationTypeOptions.includes(rawType as NotificationType)) {
    throw new Error(
      `Unsupported notification type: ${rawType}. Choose one of ${notificationTypeOptions.join(", ")}.`,
    );
  }

  const rawActionUrl = valueAfter(argv, "--action-url");
  if (rawActionUrl !== undefined) {
    const actionUrl = rawActionUrl.trim();
    if (!isSafeInternalActionUrl(actionUrl)) {
      throw new Error(
        "--action-url must be a safe internal path such as /achievements.",
      );
    }
  }

  return {
    userId,
    notificationType: rawType as NotificationType,
    ...(rawActionUrl !== undefined ? { actionUrl: rawActionUrl.trim() } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseDemoInAppNotificationArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();

    const notifications = app.get(NotificationsService);
    const definition = notificationRegistry[args.notificationType];
    const created = await dataSource.transaction((manager: EntityManager) =>
      notifications.createInAppNotification(manager, {
        userId: args.userId,
        notificationType: args.notificationType,
        title: definition.label,
        message: descriptionByType[args.notificationType],
        actionUrl: args.actionUrl ?? null,
        dedupeKey: `demo:${args.notificationType}:${Date.now()}`,
      }),
    );

    if (!created) {
      console.log(
        `[demo] skipped by preference: ${args.notificationType} for ${args.userId}`,
      );
      return;
    }

    console.log(
      `[demo] created notification ${created.id}: ${args.notificationType} for ${args.userId}`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
