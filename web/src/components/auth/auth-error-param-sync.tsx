"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { getGoogleAuthErrorMessage } from "@/components/auth/auth-utils";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Renders no UI. `useSearchParams` always suspends, so reading `?error=` inside
 * the auth form would pull the whole form out of the prerendered shell. This
 * reads it in its own boundary instead and pushes the message into the store,
 * leaving only the error line — not the card — waiting on the request.
 */
export function AuthErrorParamSync() {
  const searchParams = useSearchParams();
  const setAuthError = useAuthStore((state) => state.setAuthError);
  const message = getGoogleAuthErrorMessage(
    searchParams.get("error") ?? undefined,
  );

  React.useEffect(() => {
    if (message) {
      setAuthError(message);
    }
  }, [message, setAuthError]);

  return null;
}
