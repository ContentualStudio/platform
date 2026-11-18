import { Suspense, type ReactNode } from "react";
import { RetryBoundary } from "@/components/error/retry-boundary";

/** The admin's titled, bordered section: one per panel on a page. */
export function Panel({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex scroll-mt-6 flex-col rounded-lg border border-border bg-background" id={id}>
      <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
        {title}
      </h2>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function PanelSkeleton({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <Panel title={title}>
      <div aria-hidden className="flex flex-col gap-3" data-skeleton>
        {Array.from({ length: rows }).map((_, index) => (
          <div className="h-10 rounded-sm bg-foreground/5" key={index} />
        ))}
      </div>
    </Panel>
  );
}

// One title drives the skeleton, the error and (inside the panel) the heading.
export function PanelBoundary({
  title,
  rows,
  children,
}: {
  title: string;
  rows?: number;
  children: ReactNode;
}) {
  return (
    <RetryBoundary description={`We couldn't load ${title.toLowerCase()}.`} title={`${title} unavailable`}>
      <Suspense fallback={<PanelSkeleton rows={rows} title={title} />}>{children}</Suspense>
    </RetryBoundary>
  );
}
