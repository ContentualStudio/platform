import { Suspense } from "react";
import { PageSkeleton } from "@/components/dashboard/shell-skeletons";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { InstagramConnectCard } from "@/components/platforms/instagram-connect-card";
import { readCallbackResult } from "@/lib/instagram-connection";
import { getInstagramConnectionServer } from "@/lib/server-instagram-connection";

// `searchParams` is awaited below the boundary rather than at the top, so the
// route keeps its prerendered shell — the connect result only ever arrives on a
// redirect back from Instagram, and the page should not become dynamic for
// every other visit because of it.
export default function PlatformsPage({
  searchParams,
}: PageProps<"/platforms">) {
  return (
    <RetryBoundary description="We couldn't load your connected platforms. Please try again.">
      <Suspense fallback={<PageSkeleton />}>
        <PlatformsContent searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function PlatformsContent({
  searchParams,
}: Pick<PageProps<"/platforms">, "searchParams">) {
  const [params, connection] = await Promise.all([
    searchParams,
    getInstagramConnectionServer(),
  ]);

  const callback = readCallbackResult(
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  );

  return (
    <section className="w-full max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-foreground">
        Connected platforms
      </h1>
      <p className="mb-8 text-base text-muted">
        Connect an account and Contentual tracks your growth for you, so your
        progress shows up alongside the work you put in.
      </p>

      <InstagramConnectCard callback={callback} connection={connection} />

      <p className="mt-6 text-sm text-muted">
        YouTube, TikTok and LinkedIn are coming soon.
      </p>
    </section>
  );
}
