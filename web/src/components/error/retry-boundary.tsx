"use client";

import { catchError, type ErrorInfo } from "next/error";
import { Button } from "@/components/ui/button";

interface RetryBoundaryProps {
  /** Heading shown in place of the failed subtree. */
  title?: string;
  description?: string;
}

// `ErrorInfo.error` is `unknown`: a thrown value is not guaranteed to be an Error.
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Please try again.";
}

/**
 * Component-level error boundary. Unlike `error.tsx` it can wrap any part of a
 * tree, it leaves `notFound()` and `redirect()` alone (so the auth and stage
 * gates still work through it), and its `retry()` re-runs the Server Components
 * inside it — which is what the app needs when the api is briefly unreachable.
 */
function RetryFallback(
  { title = "Something went wrong", description }: RetryBoundaryProps,
  { error, retry }: ErrorInfo,
) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-surface px-6 py-12 text-center"
      role="alert"
    >
      <p className="text-xl font-extrabold tracking-tight text-foreground">
        {title}
      </p>
      <p className="max-w-[42ch] text-base text-muted-foreground">
        {description ?? errorMessage(error)}
      </p>
      <Button className="mt-2" onClick={() => retry()} size="sm">
        Try again
      </Button>
    </div>
  );
}

export const RetryBoundary = catchError(RetryFallback);
