import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared centred state block: connect prompt, empty, sparse-data, and error
 * states all render through this so their treatment stays consistent.
 */
export function AnalyticsMessage({
  icon: Icon,
  title,
  description,
  action,
  role,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-3xl bg-surface px-6 py-12 text-center",
        className,
      )}
      role={role}
    >
      <Icon aria-hidden className="size-12 text-muted opacity-40" />
      <div>
        <h3 className="mb-2 text-lg font-bold text-foreground">{title}</h3>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
