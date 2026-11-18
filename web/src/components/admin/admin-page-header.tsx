import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Every admin section opens with this, so titles, eyebrows and actions sit
 * the same way on every page.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-2xl flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminSectionSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6" data-skeleton>
      <div className="h-12 w-full rounded-md bg-foreground/5" />
      <div className="flex flex-col gap-2">
        {["a", "b", "c", "d", "e", "f"].map((row) => (
          <div className="h-14 w-full rounded-sm bg-foreground/5" key={row} />
        ))}
      </div>
    </div>
  );
}
