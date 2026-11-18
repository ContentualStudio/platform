import type { InAppNotification } from "../schemas/notifications.schema";

export interface InAppNotificationQueueState {
  readonly active: InAppNotification | null;
  readonly queued: readonly InAppNotification[];
  readonly shownIds: readonly string[];
}

export const initialInAppNotificationQueueState: InAppNotificationQueueState = {
  active: null,
  queued: [],
  shownIds: [],
};

function sortHydrationBatch(
  notifications: readonly InAppNotification[],
): readonly InAppNotification[] {
  return [...notifications].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

function uniqueById(
  notifications: readonly InAppNotification[],
): readonly InAppNotification[] {
  const seen = new Set<string>();
  const unique: InAppNotification[] = [];

  for (const notification of notifications) {
    if (seen.has(notification.id)) {
      continue;
    }

    seen.add(notification.id);
    unique.push(notification);
  }

  return unique;
}

export function enqueueInAppNotifications(
  state: InAppNotificationQueueState,
  notifications: readonly InAppNotification[],
): InAppNotificationQueueState {
  const activeId = state.active?.id ?? null;
  const queuedIds = new Set(state.queued.map((notification) => notification.id));
  const shownIds = new Set(state.shownIds);
  const seenIds = new Set([
    ...state.shownIds,
    ...(state.active ? [state.active.id] : []),
    ...state.queued.map((notification) => notification.id),
  ]);
  const candidates = uniqueById(sortHydrationBatch(notifications)).filter(
    (notification) => !notification.read && !seenIds.has(notification.id),
  );

  if (candidates.length === 0) {
    return state;
  }

  if (activeId === null) {
    const [active, ...queued] = candidates;

    return {
      ...state,
      active,
      queued: [...state.queued, ...queued],
    };
  }

  const mergedQueued = [...state.queued];

  for (const candidate of candidates) {
    if (candidate.id === activeId || queuedIds.has(candidate.id) || shownIds.has(candidate.id)) {
      continue;
    }

    mergedQueued.push(candidate);
    queuedIds.add(candidate.id);
  }

  if (mergedQueued.length === state.queued.length) {
    return state;
  }

  return {
    ...state,
    queued: mergedQueued,
  };
}

export function markInAppNotificationShown(
  state: InAppNotificationQueueState,
  id: string,
): InAppNotificationQueueState {
  if (state.shownIds.includes(id)) {
    return state;
  }

  return {
    ...state,
    shownIds: [...state.shownIds, id],
  };
}

export function advanceInAppNotificationQueue(
  state: InAppNotificationQueueState,
): InAppNotificationQueueState {
  if (state.queued.length === 0) {
    if (state.active === null) {
      return state;
    }

    return {
      ...state,
      active: null,
    };
  }

  const [active, ...queued] = state.queued;

  return {
    ...state,
    active,
    queued,
  };
}

export function removeInAppNotificationFromQueue(
  state: InAppNotificationQueueState,
  id: string,
): InAppNotificationQueueState {
  const activeId = state.active?.id ?? null;

  if (activeId === id) {
    if (state.queued.length === 0) {
      return {
        ...state,
        active: null,
      };
    }

    const [active, ...queued] = state.queued;

    return {
      ...state,
      active,
      queued,
    };
  }

  const queued = state.queued.filter((notification) => notification.id !== id);

  if (queued.length === state.queued.length) {
    return state;
  }

  return {
    ...state,
    queued,
  };
}

export function clearQueuedInAppNotifications(
  state: InAppNotificationQueueState,
): InAppNotificationQueueState {
  if (state.queued.length === 0) {
    return state;
  }

  return {
    ...state,
    queued: [],
  };
}
