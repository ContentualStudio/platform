import { cn } from "@/lib/utils";

interface PlanningSectionProps {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description: string;
  title: string;
}

/**
 * The card that wraps each Planning block: title, one-line explainer, and an
 * optional trailing control (count badge, save indicator, or a button).
 */
export function PlanningSection({
  action,
  children,
  className,
  description,
  title,
}: PlanningSectionProps) {
  return (
    <section className={cn("rounded-lg bg-surface p-6", className)}>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-0.5 text-2xl font-semibold text-foreground">
            {title}
          </h2>
          <p className="m-0 max-w-[480px] text-sm leading-loose text-muted">
            {description}
          </p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PlanningSectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 rounded-xl bg-background px-3 py-1 text-sm font-semibold text-muted">
      {children}
    </div>
  );
}
