"use client";

import * as React from "react";
import { captureClientError } from "@/lib/telemetry/client";

// Last resort: replaces the root layout, so it must ship its own html/body.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Reported explicitly: an error React caught at a boundary never reaches the
  // window handlers PostHog installs, so without this the app's most severe
  // failure would be the one failure nobody heard about.
  React.useEffect(() => {
    captureClientError(error, { operation: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="flex flex-col items-center gap-3 text-center" role="alert">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Something went wrong
          </h1>
          <p className="max-w-[42ch] text-base text-muted-foreground">
            Contentual hit an unexpected error{error.digest ? ` (${error.digest})` : ""}.
          </p>
          <button
            className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background hover:opacity-90"
            onClick={() => retry()}
            type="button"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
