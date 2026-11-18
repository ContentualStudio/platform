"use client";

import * as React from "react";
import { identifyUser, resetTelemetryIdentity } from "@/lib/telemetry/client";

/**
 * Ties the browser's PostHog history to the signed-in user.
 *
 * This is the reconciliation half of the pre-auth funnel: the api captures
 * `login_code_requested` and `user_signed_up` against the browser's anonymous
 * distinct id, and `identify` here tells PostHog that anonymous person and this
 * user are the same one. Without it the funnel breaks in two at the moment of
 * sign-up.
 *
 * Rendered by `ProfileGate`, which already resolves the session once per request
 * behind its own Suspense boundary. Doing it there rather than in a layout keeps
 * the protected routes from blocking on a session read, and doing it in a client
 * component is unavoidable — the distinct id only exists in the browser.
 *
 * Renders no UI.
 */
export function TelemetryIdentity({ userId }: { userId: string }) {
  React.useEffect(() => {
    identifyUser(userId);

    // Reset when the identified user changes or the tree unmounts, so a shared
    // browser cannot carry one person's distinct id into the next session.
    return () => {
      resetTelemetryIdentity();
    };
  }, [userId]);

  return null;
}
