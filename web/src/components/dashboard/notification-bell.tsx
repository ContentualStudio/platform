"use client";

import * as React from "react";
import { Bell, Info, LineChart, Repeat, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isSafeInternalActionUrl } from "../../lib/internal-action-url";
import {
  formatRelativeTime,
  shouldOpenNotificationFromKey,
} from "../../lib/notification-bell-utils";
import type { InAppNotification } from "../../schemas/notifications.schema";
import { cn } from "@/lib/utils";
import { useInAppNotificationsContext } from "@/components/notifications/in-app-notifications-provider";

type NotificationKind = "challenge" | "streak" | "insight" | "system";

const KIND_BY_TYPE: Record<Exclude<InAppNotification["type"], null>, NotificationKind> = {
  daily_task_notice: "challenge",
  badge_earned: "insight",
  streak_at_risk: "streak",
  milestone_reached: "insight",
};

const KIND_ICON: Record<NotificationKind, typeof Zap> = {
  challenge: Zap,
  insight: LineChart,
  streak: Repeat,
  system: Info,
};

const KIND_ICON_CLASS: Record<NotificationKind, string> = {
  challenge: "bg-accent/10 text-accent",
  insight: "bg-tint-blue-soft text-tint-blue",
  streak: "bg-tint-green-soft text-tint-green",
  system: "bg-surface text-muted",
};

function displayError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "We couldn't update your notifications.";
}

export function NotificationBell() {
  const router = useRouter();
  const {
    connection: status,
    dismiss,
    items,
    markAllRead,
    markRead,
    unreadCount,
  } = useInAppNotificationsContext();
  const [error, setError] = React.useState<string | null>(null);

  async function openNotification(item: InAppNotification) {
    setError(null);

    try {
      if (!item.read) {
        await markRead(item.id);
      }

      if (item.actionUrl) {
        if (!isSafeInternalActionUrl(item.actionUrl)) {
          throw new Error("This notification has an invalid destination.");
        }
        router.push(item.actionUrl);
      }
    } catch (caught) {
      setError(displayError(caught));
    }
  }

  async function handleMarkAllRead() {
    setError(null);
    try {
      await markAllRead();
    } catch (caught) {
      setError(displayError(caught));
    }
  }

  async function handleDismiss(id: string) {
    setError(null);
    try {
      await dismiss(id);
    } catch (caught) {
      setError(displayError(caught));
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative flex size-10 items-center justify-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent" />
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="flex max-h-[560px] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised p-0"
        sideOffset={12}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold text-foreground">
              Notifications
            </span>
            {unreadCount > 0 ? (
              <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">
                {unreadCount}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {status === "reconnecting" ? (
              <span className="text-xs font-medium text-muted" role="status">
                Reconnecting…
              </span>
            ) : null}
            {unreadCount > 0 ? (
              <button
                className="text-sm font-semibold text-accent transition-opacity hover:opacity-80"
                onClick={() => void handleMarkAllRead()}
                type="button"
              >
                Mark all as read
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="border-b border-border px-6 py-2 text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto py-2">
          {status === "loading" ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              Loading notifications…
            </div>
          ) : status === "error" && items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              Notifications are temporarily unavailable.
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted">
              <Bell className="mx-auto mb-3 size-8 opacity-20" />
              <p className="text-sm">You&apos;re all caught up</p>
            </div>
          ) : (
            items.map((item) => {
              const kind = item.type ? KIND_BY_TYPE[item.type] : "system";
              const Icon = KIND_ICON[kind];

              return (
                <div
                  aria-label={item.title}
                  className={cn(
                    "group relative flex cursor-pointer gap-3.5 px-6 py-3.5 transition-colors hover:bg-foreground/[0.02]",
                    !item.read && "bg-accent/[0.04] hover:bg-accent/[0.08]",
                  )}
                  key={item.id}
                  onClick={() => void openNotification(item)}
                  onKeyDown={(event) => {
                    if (!shouldOpenNotificationFromKey(event)) return;
                    event.preventDefault();
                    void openNotification(item);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {!item.read ? (
                    <span className="absolute left-2.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
                  ) : null}
                  <div
                    className={cn(
                      "flex size-10 flex-shrink-0 items-center justify-center rounded-3xl",
                      KIND_ICON_CLASS[kind],
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-body text-foreground">
                      {item.title}
                    </p>
                    <p className="line-clamp-2 text-sm leading-body text-muted-foreground">
                      {item.description}
                    </p>
                    <time
                      className="mt-1 block text-xs text-muted"
                      dateTime={item.createdAt}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </time>
                  </div>
                  <button
                    aria-label="Dismiss notification"
                    className="absolute right-5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-foreground/5 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDismiss(item.id);
                    }}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
