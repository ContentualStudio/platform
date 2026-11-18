import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The admin's one empty / not-found treatment. `bordered` draws its own card
 * for use on the page; leave it off inside a panel that already has one.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = false,
  heading: Heading = "h2",
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  /** h1 when the empty state is the page's only content (e.g. not-found). */
  heading?: "h1" | "h2";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-20 text-center",
        bordered && "rounded-lg border border-border bg-background",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-control text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <Heading className="text-lg font-bold text-foreground">{title}</Heading>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export const emptyStateActionClassName =
  "text-sm font-semibold text-accent-text hover:underline";
