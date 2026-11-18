"use client";

import * as React from "react";
import { Check, LoaderCircle } from "lucide-react";
import {
  getNotificationPreferencesAction,
  setNotificationPreferenceAction,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  SettingsSectionLabel,
  SettingsToggle,
} from "@/components/settings/settings-ui";
import {
  notificationPreferenceKey,
  toggleNotificationPreference,
} from "@/lib/notification-preferences";
import type {
  NotificationPreference,
  NotificationPreferencesResponse,
  NotificationPreferenceUpdate,
} from "@/schemas/notifications.schema";
import type { ActionResult } from "@/lib/server/result";
import { cn } from "@/lib/utils";

type PreferenceChannel = NotificationPreference["channels"][number];

interface FailedPreference {
  readonly input: NotificationPreferenceUpdate;
  readonly key: string;
  readonly previous: NotificationPreference[];
}

function actionFailure(
  result: ActionResult<unknown>,
  fallbackMessage: string,
): { code: string; message: string } | null {
  return result.ok
    ? null
    : {
        code: result.code,
        message: result.message || fallbackMessage,
      };
}

function ToggleSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading notification preferences">
      {["one", "two", "three", "four"].map((item) => (
        <div
          className="h-[86px] animate-pulse rounded-4xl bg-control"
          key={item}
        />
      ))}
    </div>
  );
}

function PreferenceToggle({
  channel,
  disabled,
  onToggle,
  preference,
  saving,
  saved,
}: {
  channel: PreferenceChannel;
  disabled: boolean;
  onToggle: () => void;
  preference: NotificationPreference;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div className="flex min-w-[44px] items-center justify-center px-2 py-1.5">
      {saved ? (
        <span className="sr-only" role="status">
          Saved
        </span>
      ) : null}
      <div className="relative">
        <SettingsToggle
          checked={!channel.optedOut}
          disabled={disabled || saving}
          label={`${preference.label} ${channel.label} notification`}
          onChange={onToggle}
        />
        {saving ? (
          <LoaderCircle className="pointer-events-none absolute inset-0 m-auto size-3.5 animate-spin text-muted" />
        ) : null}
      </div>
    </div>
  );
}

export function NotificationsSettings({
  preferences: initialPreferences,
}: {
  preferences: NotificationPreferencesResponse | null;
}) {
  const [preferences, setPreferences] = React.useState<
    NotificationPreference[] | null
  >(initialPreferences?.preferences ?? null);
  const [loading, setLoading] = React.useState(initialPreferences === null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [requestError, setRequestError] = React.useState("");
  const [failedPreference, setFailedPreference] =
    React.useState<FailedPreference | null>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelColumns = React.useMemo(() => {
    const availableChannels = new Set(
      preferences?.flatMap((preference) =>
        preference.channels.map((channel) => channel.channel),
      ),
    );

    return (["email", "in_app"] as const)
      .filter((channel) => availableChannels.has(channel))
      .map((channel) => ({
        channel,
        label: channel === "email" ? "Email" : "In-App",
      }));
  }, [preferences]);

  React.useEffect(() => {
    return () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (initialPreferences) {
      return;
    }

    let active = true;
    setLoading(true);

    void getNotificationPreferencesAction()
      .then((result) => {
        if (!active) {
          return;
        }

        const failure = actionFailure(
          result,
          "We couldn't load your notification preferences. Try again.",
        );

        if (failure) {
          setRequestError(failure.message);
          return;
        }

        if (result.ok) {
          setPreferences([...result.data]);
          setRequestError("");
        }
      })
      .catch(() => {
        if (active) {
          setRequestError(
            "We couldn't load your notification preferences. Try again.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [initialPreferences, loadAttempt]);

  function showSaved(key: string) {
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
    }

    setSaved(key);
    savedTimer.current = setTimeout(() => setSaved(null), 2_500);
  }

  async function persistPreference(
    input: NotificationPreferenceUpdate,
    previous: NotificationPreference[],
    key: string,
  ) {
    setSaving(key);
    setSaved(null);
    setRequestError("");
    setFailedPreference(null);

    try {
      const result = await setNotificationPreferenceAction(input);
      const failure = actionFailure(
        result,
        "We couldn't save your notification preference. Try again.",
      );

      if (failure) {
        setPreferences(previous);
        setRequestError(failure.message);
        setFailedPreference({ input, key, previous });
        return;
      }

      if (result.ok) {
        setPreferences([...result.data]);
        showSaved(key);
      }
    } catch {
      setPreferences(previous);
      setRequestError(
        "We couldn't save your notification preference. Try again.",
      );
      setFailedPreference({ input, key, previous });
    } finally {
      setSaving(null);
    }
  }

  async function togglePreference(
    preference: NotificationPreference,
    channel: PreferenceChannel,
  ) {
    if (saving || !preferences) {
      return;
    }

    const key = notificationPreferenceKey(preference.type, channel.channel);
    const previous = preferences.map((item) => ({
      ...item,
      channels: [...item.channels],
    }));
    const next = toggleNotificationPreference(
      preferences,
      preference.type,
      channel.channel,
    );
    const input: NotificationPreferenceUpdate = {
      channel: channel.channel,
      notificationType: preference.type,
      optedOut: !channel.optedOut,
    };

    setPreferences(next);
    await persistPreference(input, previous, key);
  }

  async function retryFailedPreference() {
    if (!failedPreference || saving) {
      return;
    }

    setPreferences(failedPreference.previous);
    await persistPreference(
      failedPreference.input,
      failedPreference.previous,
      failedPreference.key,
    );
  }

  return (
    <section className="w-full">
      <SettingsSectionLabel>Notification Preferences</SettingsSectionLabel>

      {loading && preferences === null ? <ToggleSkeleton /> : null}

      {!loading && preferences === null ? (
        <div className="rounded-4xl border border-dashed border-border p-6">
          <p className="text-sm font-semibold text-foreground">
            Notification preferences are unavailable.
          </p>
          {requestError ? (
            <p
              className="mt-2 text-sm font-medium text-destructive"
              role="alert"
            >
              {requestError}
            </p>
          ) : null}
          <p className="mt-1 text-sm leading-5 text-muted">
            We couldn&apos;t load the notification registry. Try again to
            refresh this section.
          </p>
          <Button
            className="mt-4"
            disabled={loading}
            onClick={() => {
              setRequestError("");
              setLoadAttempt((attempt) => attempt + 1);
            }}
            size="sm"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!loading && preferences ? (
        channelColumns.length > 0 ? (
          <>
            <div className="mb-2 flex justify-end gap-6 text-xs font-bold uppercase tracking-[0.06em] text-muted">
              {channelColumns.map((channel) => (
                <span className="min-w-[44px] text-center" key={channel.channel}>
                  {channel.channel === "email" ? "Email" : "In-App"}
                </span>
              ))}
            </div>
            {preferences.map((preference) => (
              <div
                className="flex min-h-[52px] items-center justify-between gap-5 border-b border-border py-3 last:border-0"
                key={preference.type}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {preference.label}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted">
                    {preference.description}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex shrink-0 gap-6",
                    channelColumns.length > 1 ? "gap-6" : "gap-0",
                  )}
                >
                    {channelColumns.map(({ channel }) => {
                      const preferenceChannel = preference.channels.find(
                        (item) => item.channel === channel,
                      );

                      if (!preferenceChannel) {
                        return <div aria-hidden key={channel} />;
                      }

                      const key = notificationPreferenceKey(
                        preference.type,
                        preferenceChannel.channel,
                      );

                      return (
                        <PreferenceToggle
                          channel={preferenceChannel}
                          disabled={saving !== null}
                          key={channel}
                          onToggle={() =>
                            void togglePreference(preference, preferenceChannel)
                          }
                          preference={preference}
                          saved={saved === key}
                          saving={saving === key}
                        />
                      );
                    })}
                </div>
              </div>
            ))}
          </>
        ) : null
      ) : null}

      {requestError && preferences !== null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-medium text-destructive">{requestError}</p>
          {failedPreference ? (
            <Button
              disabled={saving !== null}
              onClick={() => void retryFailedPreference()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}

      {saved ? (
        <p
          aria-live="polite"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-success"
          role="status"
        >
          <Check className="size-4" /> Saved
        </p>
      ) : null}
    </section>
  );
}
