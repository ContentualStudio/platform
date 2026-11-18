import type { Instrumentation } from "next";

/**
 * Reports every server-side error Next.js catches.
 *
 * This is the framework's own hook, which is why it is used instead of wrapping
 * each feature: it fires for Server Component renders, Server Actions, Route
 * Handlers and proxy alike, so a feature gets error capture without opting in and
 * cannot forget to. The shared request wrappers in `lib/server/` add typed
 * results and validation on top; they are not what makes capture happen.
 *
 * Nothing from `request.headers` is forwarded, and `request.path` is stripped of
 * its query string before it is sent — a query string is where an email or a
 * token ends up in a url, and this is an analytics pipeline.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // posthog-node is a Node library, and this hook also runs in the Edge runtime
  // (proxy errors). Importing it lazily keeps the Edge bundle from pulling in a
  // module it cannot run.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { captureServerError } = await import("./lib/telemetry/server");

  // The route *template* — `/settings/[section]` — so failures group by handler.
  // The resolved path would scatter them one per id and put that id in the
  // payload.
  const route = context.routePath;

  captureServerError(error, {
    operation: `${context.routeType} ${route}`,
    source: context.routeType,
    route,
    method: request.method,
    // React can replace the thrown value on its way through a Server Component
    // render, so the digest is often the only way back to the original — and it
    // is what the user is shown and can quote.
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : undefined,
  });
};
