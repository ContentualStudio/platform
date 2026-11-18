"use client";

import * as React from "react";
import { REFERRAL_COOKIE } from "@/schemas/billing.schema";
import { attachReferral } from "@/services/billing.service";

function readReferralCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${REFERRAL_COOKIE}=`));

  return match ? decodeURIComponent(match.slice(REFERRAL_COOKIE.length + 1)) : null;
}

function clearReferralCookie() {
  document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

/**
 * Attributes the code left by `/r/<code>` to the signed-in account. The cookie
 * is cleared whatever the outcome so a refused code is not retried forever.
 */
export function ReferralCapture() {
  React.useEffect(() => {
    const code = readReferralCookie();

    if (!code) {
      return;
    }

    void attachReferral(code)
      .catch(() => undefined)
      .finally(clearReferralCookie);
  }, []);

  return null;
}
