"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, Info } from "lucide-react";
import {
  InstagramIcon,
  PlatformIcon,
} from "@/components/settings/platform-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCallbackError,
  toInstagramConnectionState,
  type InstagramCallbackResult,
  type InstagramConnectionResponse,
} from "@/lib/instagram-connection";
import { cn } from "@/lib/utils";
import {
  InstagramServiceError,
  recheckInstagramAccount,
  startInstagramConnect,
} from "@/services/instagram.service";

/**
 * The Instagram connect surface.
 *
 * Every path through it leaves the user able to carry on: a cancelled
 * authorization, a personal account, an account with too few followers for the
 * gated metrics — none of them are dead ends, and none of them block
 * onboarding. That is a requirement of the flow rather than a nicety, which is
 * why the "not now" affordances are as present as the primary action.
 */
export function InstagramConnectCard({
  callback,
  connection,
}: {
  callback: InstagramCallbackResult;
  connection: InstagramConnectionResponse | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [dismissedPrompt, setDismissedPrompt] = React.useState(false);
  const [consented, setConsented] = React.useState(false);

  const state = connection
    ? toInstagramConnectionState(connection)
    : ({ kind: "disconnected" } as const);

  async function connect() {
    setBusy(true);
    setError("");

    try {
      // A full navigation rather than a router push: the next page is
      // Instagram's, not ours.
      window.location.assign(await startInstagramConnect({ consent: consented }));
    } catch (caught) {
      setError(
        caught instanceof InstagramServiceError
          ? caught.message
          : "We couldn't start the Instagram connection. Try again.",
      );
      setBusy(false);
    }
  }

  async function recheck() {
    setBusy(true);
    setError("");

    try {
      const result = await recheckInstagramAccount();

      if (result.accountType === "professional") {
        router.refresh();
      } else {
        setError(
          "That account is still personal. Switch it to a Business or Creator account in the Instagram app, then check again.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof InstagramServiceError
          ? caught.message
          : "We couldn't re-check your Instagram account. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "unavailable") {
    return (
      <div className="rounded-xl bg-surface p-6">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformIcon icon={InstagramIcon} tone="bg-control text-muted" />
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground">Instagram</p>
            <p className="text-sm text-muted">
              Connecting Instagram isn&apos;t available just yet. We&apos;ll let
              you know as soon as it is.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const connected = state.kind === "connected";
  const linked = state.kind !== "disconnected";

  return (
    <div className="rounded-xl bg-surface p-6">
      {callback.kind === "error" ? (
        <Notice tone="warning">{describeCallbackError(callback.reason)}</Notice>
      ) : null}

      {callback.kind === "connected" && callback.limitedFollowers ? (
        <Notice tone="info">
          Instagram is connected. Some growth metrics need at least 100
          followers, so they will appear as your account grows - everything else
          is tracking from today.
        </Notice>
      ) : null}

      {state.kind === "needs-professional" && !dismissedPrompt ? (
        <div className="mb-5 rounded-2xl border border-border p-5">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Switch to a professional account for analytics
          </p>
          <p className="mb-4 text-sm text-muted">
            Instagram only shares insights for Business and Creator accounts. In
            the Instagram app, open Settings, then Account type and tools, and
            switch to a professional account. It is free, and your posts stay
            exactly as they are.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy}
              onClick={() => void recheck()}
              size="sm"
              variant="accent"
            >
              {busy ? <Spinner className="size-4" /> : null}
              Check again
            </Button>
            {/* Never a dead end: the user can move on and come back to this. */}
            <Button
              onClick={() => setDismissedPrompt(true)}
              size="sm"
              variant="outline"
            >
              Continue without analytics
            </Button>
          </div>
        </div>
      ) : null}

      {state.kind === "needs-reconnect" ? (
        <Notice tone="warning">
          Instagram needs reconnecting - the permission we were given has
          expired. Your history is safe; reconnect to keep it growing.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformIcon
            icon={InstagramIcon}
            tone="bg-tint-purple-soft text-tint-purple"
          />
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground">Instagram</p>
            <p className="truncate text-sm text-muted">
              {linked
                ? `Connected as @${state.connection.username}`
                : "Track your follower growth and see what is working."}
            </p>
          </div>
        </div>

        {connected ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-tint-green">
            <Check aria-hidden className="size-4" />
            Connected
          </span>
        ) : (
          <Button
            disabled={busy || (state.kind === "disconnected" && !consented)}
            onClick={() => void connect()}
            variant="accent"
          >
            {busy ? <Spinner className="size-4" /> : null}
            {state.kind === "disconnected" ? "Connect Instagram" : "Reconnect"}
          </Button>
        )}
      </div>

      {/* Consent is recorded before authorizing, because authorizing is itself
          the first act of reading their data. */}
      {state.kind === "disconnected" ? (
        <label className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm text-muted">
          <input
            checked={consented}
            className="mt-1 size-4 shrink-0 accent-accent"
            onChange={(event) => setConsented(event.target.checked)}
            type="checkbox"
          />
          <span>
            I agree that Contentual may read my Instagram profile and insights to
            track my growth. You can withdraw this at any time in settings, and
            disconnecting deletes everything we stored.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {connected ? (
        <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted">
          <Clock aria-hidden className="size-4" />
          Growth is tracked from the day you connected - there is no history to
          backfill, so your graph fills in from now.
        </p>
      ) : null}
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "info" | "warning";
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-2xl p-4 text-sm",
        tone === "warning"
          ? "bg-tint-amber-soft text-tint-amber"
          : "bg-tint-indigo-soft text-tint-indigo",
      )}
      role="status"
    >
      <Icon aria-hidden className="mt-1 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
