import { PermanentEffectError } from "../effect-dispatcher.port";
import {
  notificationRegistry,
  notificationTypeOptions,
  type NotificationType,
} from "../../notifications/notification-registry";
import { isSafeInternalActionUrl } from "../../notifications/internal-action-url";

// The CMS normalises every rule's effect parameters to exactly one of
// { programmeSourceId }, { badgeSourceId }, { callTypeSourceId } or { message }
// before it writes the mirror. They are re-read defensively here for the same
// reason the rule itself is re-parsed: a mirror row can predate a CMS change,
// and a handler that trusted it would write a row pointing at nothing.

/**
 * A handler was given parameters it cannot act on.
 *
 * Permanent by nature: the rule needs re-authoring, not another attempt, so
 * retrying the event would fail identically forever. The evaluator reports it
 * to PostHog as an effect-stage failure, and the reservation stays unmarked so
 * no effect is ever recorded as having happened.
 */
export class EffectParameterError extends PermanentEffectError {
  constructor(message: string) {
    super(message);
    this.name = "EffectParameterError";
  }
}

function text(
  params: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = params[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function required(
  params: Readonly<Record<string, unknown>>,
  key: string,
  effectType: string,
): string {
  const value = text(params, key);

  if (!value) {
    throw new EffectParameterError(`${effectType} requires ${key}`);
  }

  return value;
}

export function programmeTarget(
  params: Readonly<Record<string, unknown>>,
  effectType: string,
): string {
  return required(params, "programmeSourceId", effectType);
}

export function badgeTarget(
  params: Readonly<Record<string, unknown>>,
  effectType: string,
): string {
  return required(params, "badgeSourceId", effectType);
}

export function callTypeTarget(
  params: Readonly<Record<string, unknown>>,
  effectType: string,
): string {
  return required(params, "callTypeSourceId", effectType);
}

export function messageContent(
  params: Readonly<Record<string, unknown>>,
  effectType: string,
): string {
  return required(params, "message", effectType);
}

export interface InAppNotificationParameters {
  readonly message: string;
  readonly title: string;
  readonly notificationType: NotificationType | null;
  readonly actionUrl: string | null;
}

export function inAppNotificationParameters(
  params: Readonly<Record<string, unknown>>,
  effectType: string,
): InAppNotificationParameters {
  const message = messageContent(params, effectType);

  const rawType = params.notificationType;
  let notificationType: NotificationType | null = null;
  if (rawType !== undefined && rawType !== null) {
    if (typeof rawType !== "string" || !rawType.trim()) {
      throw new EffectParameterError(
        `${effectType} notificationType must not be blank`,
      );
    }

    const normalizedType = rawType.trim();
    if (!notificationTypeOptions.includes(normalizedType as NotificationType)) {
      throw new EffectParameterError(
        `${effectType} notificationType must be registered`,
      );
    }

    notificationType = normalizedType as NotificationType;
  }

  const rawTitle = params.title;
  let title: string;
  if (rawTitle === undefined || rawTitle === null) {
    title = notificationType
      ? notificationRegistry[notificationType].label
      : "Notification";
  } else {
    if (typeof rawTitle !== "string" || !rawTitle.trim()) {
      throw new EffectParameterError(`${effectType} title must not be blank`);
    }

    title = rawTitle.trim();
  }

  const rawActionUrl = params.actionUrl;
  let actionUrl: string | null = null;
  if (rawActionUrl !== undefined && rawActionUrl !== null) {
    if (typeof rawActionUrl !== "string") {
      throw new EffectParameterError(`${effectType} actionUrl must be a string`);
    }

    if (!isSafeInternalActionUrl(rawActionUrl)) {
      throw new EffectParameterError(`${effectType} actionUrl is invalid`);
    }

    actionUrl = rawActionUrl;
  }

  return {
    message,
    title,
    notificationType,
    actionUrl,
  };
}
