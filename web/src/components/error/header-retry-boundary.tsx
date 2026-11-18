"use client";

import { catchError, type ErrorInfo } from "next/error";

/**
 * Header-sized fallback: a failed profile read should cost the greeting and
 * avatar, not the whole page. Keeps the header's height so the shell below it
 * doesn't jump.
 */
function HeaderRetryFallback(_props: object, { retry }: ErrorInfo) {
  return (
    <div className="mb-8 flex items-center justify-between" role="alert">
      <p className="text-base text-muted-foreground">
        Couldn&apos;t load your profile.
      </p>
      <button
        className="rounded-full px-4 py-2 text-sm font-semibold text-accent hover:bg-foreground/5"
        onClick={() => retry()}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}

export const HeaderRetryBoundary = catchError(HeaderRetryFallback);
