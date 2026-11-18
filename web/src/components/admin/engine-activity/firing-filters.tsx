"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { engineActivityHref, type FiringFilters } from "@/lib/admin/engine-activity-search";

const selectClassName =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 sm:w-56";

/**
 * The firing log's two filters. They write to the URL, so a filter survives a
 * retry and the trip to a user's page and back, and the server render stays
 * the single source of what is listed.
 */
export function FiringFilterControls({
  filters,
  rules,
  events,
}: {
  filters: FiringFilters;
  rules: { id: string; name: string | null }[];
  events: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(next: Partial<FiringFilters>) {
    startTransition(() => {
      router.replace(engineActivityHref({ ...filters, ...next }), { scroll: false });
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="firing-rule">
        Rule
      </label>
      <select
        className={selectClassName}
        id="firing-rule"
        onChange={(event) => apply({ ruleId: event.target.value || null })}
        value={filters.ruleId ?? ""}
      >
        <option value="">All rules</option>
        {rules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            {rule.name ?? `${rule.id} (removed)`}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="firing-event">
        Event
      </label>
      <select
        className={selectClassName}
        id="firing-event"
        onChange={(event) => apply({ eventName: event.target.value || null })}
        value={filters.eventName ?? ""}
      >
        <option value="">All events</option>
        {events.map((event) => (
          <option key={event} value={event}>
            {event}
          </option>
        ))}
      </select>

      {isPending ? <Spinner aria-label="Updating" className="size-4 text-muted-foreground" /> : null}
    </div>
  );
}
