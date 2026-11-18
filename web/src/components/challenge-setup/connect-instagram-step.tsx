"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  describeCallbackError,
  readCallbackResult,
} from "@/lib/instagram-connection";
import {
  InstagramServiceError,
  startInstagramConnect,
} from "@/services/instagram.service";

interface ConnectInstagramStepProps {
  /** Called once, when the user returns from a successful authorization. */
  onConnected: () => void;
  onSkip: () => void;
  value?: boolean;
}

/**
 * The onboarding connect step.
 *
 * "Connect" leaves the app for Instagram's authorization page and returns to
 * this flow, so the step does not advance itself — the answer is recorded from
 * the real connection when the user comes back. "Skip for now" always works and
 * always advances: onboarding is never blocked on connecting an account.
 */
export function ConnectInstagramStep({
  onConnected,
  onSkip,
  value,
}: ConnectInstagramStepProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Instagram redirects back here with the outcome in the query string. Reading
  // it is what makes the recorded answer true only when a connection actually
  // happened — previously the step simply took the user's word for it.
  //
  // Read from `window.location` rather than `useSearchParams`, which suspends
  // while prerendering and would pull this subtree out of the route's shell.
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // The same reader /platforms uses, so the callback contract the api mints
    // has one consumer in web rather than two that must agree.
    const result = readCallbackResult(
      new URLSearchParams(window.location.search),
    );

    if (result.kind === "none") {
      return;
    }

    // Clear it first, so a refresh or a back-navigation cannot replay the
    // advance (or the banner) against a step the user has already moved past.
    const url = new URL(window.location.href);
    url.searchParams.delete("instagram");
    url.searchParams.delete("username");
    url.searchParams.delete("accountType");
    url.searchParams.delete("limited");
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.toString());

    // A failed authorization keeps the user on this step with a retryable
    // banner; Connect and Skip both still work.
    if (result.kind === "error") {
      setError(describeCallbackError(result.reason));
      return;
    }

    // A personal account authorised too — it just cannot serve insights yet,
    // which is the platforms screen's prompt to make, not this step's.
    onConnected();
  }, [onConnected]);

  async function connect() {
    setBusy(true);
    setError("");

    try {
      // Returning here rather than to /platforms, so the user lands back in the
      // flow they were part-way through.
      window.location.assign(
        await startInstagramConnect({
          // The paragraph above is the disclosure; there is no separate
          // checkbox here, unlike the platforms screen.
          consent: true,
          returnPath: "/challenge-setup",
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof InstagramServiceError
          ? caught.message
          : "We couldn't start the Instagram connection. You can skip this and connect later.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-start">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
        <span className="text-accent">Connect</span> Your Instagram
      </h2>
      <p className="mb-10 max-w-[520px] text-base text-muted-foreground">
        Connecting lets Contentual track your follower growth alongside the work
        you put in. We only ever read your profile and insights, and you can
        disconnect at any time. You can always do this later.
      </p>
      {value !== undefined ? (
        <div
          className="mb-6 w-full rounded-4xl border border-border bg-surface p-4"
          role="status"
        >
          <p className="font-semibold text-foreground">
            {value ? "Instagram connected" : "Not connected yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {value
              ? "Your saved connection status will be used for this programme."
              : "You skipped this for now. You can connect Instagram later."}
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="mb-6 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex w-full items-center justify-between">
        <Button disabled={busy} onClick={onSkip} variant="outline">
          Skip for now
        </Button>
        <Button
          className="min-w-[240px]"
          disabled={busy}
          onClick={() => void connect()}
          variant="accent"
        >
          {busy ? <Spinner className="size-4" /> : null}
          Connect Instagram
        </Button>
      </div>
    </div>
  );
}
