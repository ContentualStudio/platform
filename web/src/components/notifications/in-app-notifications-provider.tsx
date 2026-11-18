"use client";

import * as React from "react";
import { type InAppNotification } from "@/schemas/notifications.schema";
import { type InAppNotificationConnection } from "@/lib/in-app-notifications";
import {
  useInAppNotifications,
  type UseInAppNotificationsResult,
} from "@/hooks/use-in-app-notifications";
import { InAppNotificationToast } from "./in-app-notification-toast";

export interface InAppNotificationSurfaceProps {
  readonly notification: InAppNotification;
  readonly onAction: () => void;
  readonly onDismiss: () => void;
}

export type InAppNotificationSurface = (
  props: InAppNotificationSurfaceProps,
) => React.ReactNode;

export type InAppNotificationSurfaceMap = Partial<
  Record<NonNullable<InAppNotification["type"]>, InAppNotificationSurface>
>;

export interface InAppNotificationToastController {
  readonly activeNotification: InAppNotification | null;
  readonly queuedNotificationCount: number;
  readonly connection: InAppNotificationConnection;
  readonly completeActiveNotification: () => void;
  readonly dismissActiveNotification: () => Promise<void>;
}

const InAppNotificationsContext = React.createContext<
  UseInAppNotificationsResult | null
>(null);

export function InAppNotificationsProvider({
  children,
  surfaceMap,
}: {
  readonly children: React.ReactNode;
  readonly surfaceMap?: InAppNotificationSurfaceMap;
}) {
  const value = useInAppNotifications();

  return (
    <InAppNotificationsContext.Provider value={value}>
      {children}
      <InAppNotificationToast
        controller={value}
        surfaceMap={surfaceMap}
      />
    </InAppNotificationsContext.Provider>
  );
}

export function useInAppNotificationsContext(): UseInAppNotificationsResult {
  const value = React.useContext(InAppNotificationsContext);

  if (!value) {
    throw new Error(
      "useInAppNotificationsContext must be used inside InAppNotificationsProvider.",
    );
  }

  return value;
}
