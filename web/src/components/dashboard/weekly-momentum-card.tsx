"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDashboardAnalyticsState } from "@/lib/analytics-snapshot";
import { fetchAnalyticsSnapshot } from "@/services/analytics-snapshot.service";
import { cn } from "@/lib/utils";

export function WeeklyMomentumCard() {
  const [label, setLabel] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    void fetchAnalyticsSnapshot()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const state = toDashboardAnalyticsState(payload);

        if (state.kind === "ready" && state.snapshot.followerDeltaWeek !== null) {
          setLabel(
            `${state.snapshot.followerDeltaWeek > 0 ? "+" : ""}${state.snapshot.followerDeltaWeek.toLocaleString("en-US")}`,
          );
          return;
        }

        setLabel(null);
      })
      .catch(() => {
        if (!cancelled) {
          setLabel(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex min-h-31.5 items-center justify-between gap-5.5 rounded-[30px] bg-surface px-6.5 py-6">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">
          Weekly momentum
        </p>
        <p className="mt-1 text-[31px] font-black leading-none tracking-tight text-accent">
          {loading ? "-" : label ?? "Connect accounts"}
          {!loading && label ? (
            <span className="ml-2 text-lg font-bold text-foreground">
              followers
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted">
          Analytics stays secondary to today&apos;s work.
        </p>
      </div>
      <Button
        aria-label="Open analytics"
        asChild
        className={cn("size-11.5 shrink-0 rounded-full bg-background hover:bg-accent hover:text-white")}
        size="icon"
        variant="outline"
      >
        <Link href="/analytics">
          <TrendingUp aria-hidden className="size-4" />
        </Link>
      </Button>
    </section>
  );
}
