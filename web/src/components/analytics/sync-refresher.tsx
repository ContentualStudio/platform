"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const REFRESH_EVERY_MS = 4_000;

// The api stops reporting "syncing" ten minutes after a connect regardless;
// this is only a ceiling on how long one open tab keeps asking.
const GIVE_UP_AFTER_MS = 3 * 60_000;

/**
 * Re-renders the analytics page's server components every few seconds while
 * the first Instagram pull is running. Renders nothing; it unmounts, and so
 * stops, as soon as a refresh comes back no longer syncing.
 */
export function SyncRefresher() {
  const router = useRouter();

  React.useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        window.clearInterval(timer);
        return;
      }

      router.refresh();
    }, REFRESH_EVERY_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
