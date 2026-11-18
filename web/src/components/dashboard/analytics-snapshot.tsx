"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ImageIcon,
  Minus,
} from "lucide-react";
import Link from "next/link";
import {
  formatCount,
  trendOf,
  type Trend,
} from "@/components/analytics/data";
import { Button } from "@/components/ui/button";
import {
  followerDeltaShare,
  formatFollowerDelta,
  formatFollowerHero,
  toDashboardAnalyticsState,
  type DashboardAnalyticsState,
} from "@/lib/analytics-snapshot";
import { fetchAnalyticsSnapshot } from "@/services/analytics-snapshot.service";
import { cn } from "@/lib/utils";

type SnapshotVariant = "default" | "challenge";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; state: DashboardAnalyticsState };

const challengeCtaClass =
  "min-w-40 shrink-0 bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground";

const TREND_ICON: Record<Trend, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

const TREND_CLASS: Record<Trend, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function DashboardAnalyticsSnapshot({
  variant = "default",
}: {
  variant?: SnapshotVariant;
} = {}) {
  const [attempt, setAttempt] = React.useState(0);
  const [loadState, setLoadState] = React.useState<LoadState>({
    status: "loading",
  });

  React.useEffect(() => {
    let current = true;
    setLoadState({ status: "loading" });

    void fetchAnalyticsSnapshot()
      .then((response) => {
        if (current) {
          setLoadState({
            state: toDashboardAnalyticsState(response),
            status: "ready",
          });
        }
      })
      .catch(() => {
        if (current) {
          setLoadState({ status: "error" });
        }
      });

    return () => {
      current = false;
    };
  }, [attempt]);

  if (loadState.status === "loading") {
    return variant === "challenge" ? (
      <ChallengeSnapshotSkeleton />
    ) : (
      <SnapshotSkeleton />
    );
  }

  if (loadState.status === "error") {
    return (
      <SnapshotError
        onRetry={() => retry(setAttempt, setLoadState)}
        variant={variant}
      />
    );
  }

  return <SnapshotState state={loadState.state} variant={variant} />;
}

function retry(
  setAttempt: React.Dispatch<React.SetStateAction<number>>,
  setLoadState: React.Dispatch<React.SetStateAction<LoadState>>,
) {
  setLoadState({ status: "loading" });
  setAttempt((value) => value + 1);
}

function SnapshotSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="dashboard-analytics-snapshot-heading"
      className="rounded-3xl bg-surface p-8"
    >
      <p
        className="mb-6 text-xs font-semibold uppercase tracking-wide text-muted"
        id="dashboard-analytics-snapshot-heading"
      >
        Analytics snapshot
      </p>
      <div aria-hidden className="animate-pulse space-y-4">
        <div className="h-3 w-24 rounded bg-foreground/10" />
        <div className="h-14 w-48 rounded bg-foreground/10" />
        <div className="h-5 w-36 rounded bg-foreground/10" />
        <div className="h-5 w-32 rounded bg-foreground/10" />
        <div className="h-12 w-40 rounded-full bg-foreground/10" />
      </div>
    </section>
  );
}

function SnapshotError({
  onRetry,
  variant,
}: {
  onRetry: () => void;
  variant: SnapshotVariant;
}) {
  return (
    <section
      aria-labelledby="dashboard-analytics-snapshot-heading"
      className={
        variant === "challenge"
          ? "flex flex-col items-start justify-center rounded-3xl bg-surface px-8 py-15"
          : "flex min-h-[280px] flex-col items-start justify-center rounded-3xl bg-surface p-8"
      }
      role="alert"
    >
      <AlertCircle aria-hidden className="mb-4 size-8 text-destructive" />
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
        id="dashboard-analytics-snapshot-heading"
      >
        Analytics snapshot
      </p>
      <h2 className="mb-2 text-xl font-bold text-foreground">
        Insights are unavailable
      </h2>
      <p className="mb-6 max-w-sm text-base text-muted-foreground">
        We couldn&apos;t load your follower data. The rest of your dashboard is
        still available.
      </p>
      <Button onClick={onRetry} size="sm" type="button">
        Try again
      </Button>
    </section>
  );
}

function SnapshotState({
  state,
  variant,
}: {
  state: DashboardAnalyticsState;
  variant: SnapshotVariant;
}) {
  if (variant === "challenge") {
    return <ChallengeSnapshot state={state} />;
  }

  if (state.kind === "disconnected") {
    return (
      <section
        aria-labelledby="dashboard-analytics-snapshot-heading"
        className="flex min-h-[280px] flex-col items-start justify-between gap-6 rounded-3xl bg-surface p-8"
      >
        <div>
          <ImageIcon aria-hidden className="mb-5 size-8 text-accent" />
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
            id="dashboard-analytics-snapshot-heading"
          >
            Analytics snapshot
          </p>
          <h2 className="mb-2 text-3xl font-extrabold leading-snug tracking-tight text-foreground">
            Connect Instagram
          </h2>
          <p className="max-w-sm text-base text-muted-foreground">
            Link your account to see your current follower count and weekly
            momentum here.
          </p>
        </div>
        <Button asChild className="shrink-0" variant="default">
          <Link href="/platforms">Connect Instagram</Link>
        </Button>
      </section>
    );
  }

  if (state.kind === "no-history") {
    return (
      <SnapshotCard>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Analytics snapshot
        </p>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Followers
        </p>
        <p className="mb-3 text-6xl font-extrabold leading-none tracking-tight text-foreground">
          -
        </p>
        <p className="mb-6 inline-flex items-center gap-1 text-base font-semibold text-muted-foreground">
          <Minus aria-hidden className="size-4" />
          Not enough history yet
        </p>
        <p className="mb-6 text-base text-muted">
          We&apos;ll show the week-on-week change after another snapshot is
          recorded.
        </p>
        <AnalyticsLink />
      </SnapshotCard>
    );
  }

  const { snapshot } = state;
  const delta = snapshot.followerDeltaWeek;

  return (
    <SnapshotCard>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Analytics snapshot
      </p>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Followers
      </p>
      <p className="mb-3 text-6xl font-extrabold leading-none tracking-tight text-foreground">
        {formatCount(snapshot.followers)}
      </p>
      {delta === null ? (
        <p className="mb-6 inline-flex items-center gap-1 text-base font-semibold text-muted-foreground">
          <Minus aria-hidden className="size-4" />
          Not enough history yet
        </p>
      ) : (
        <SnapshotDelta delta={delta} />
      )}
      <p className="mb-6 text-base text-muted">
        Connected since {formatConnectedSince(snapshot.connectedSince)}
      </p>
      <AnalyticsLink />
    </SnapshotCard>
  );
}

function SnapshotCard({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="dashboard-analytics-snapshot-heading"
      className="rounded-3xl bg-surface p-8"
    >
      <h2 className="sr-only" id="dashboard-analytics-snapshot-heading">
        Analytics snapshot
      </h2>
      {children}
    </section>
  );
}

function SnapshotDelta({ delta }: { delta: number }) {
  const trend = trendOf(delta);
  const Icon = TREND_ICON[trend];

  return (
    <p
      className={cn(
        "mb-6 inline-flex items-center gap-1 text-base font-semibold",
        TREND_CLASS[trend],
      )}
    >
      <Icon aria-hidden className="size-4" />
      {formatFollowerDelta(delta)}
    </p>
  );
}

function ChallengeSnapshot({ state }: { state: DashboardAnalyticsState }) {
  if (state.kind === "disconnected") {
    return (
      <section
        aria-labelledby="dashboard-analytics-snapshot-heading"
        className="rounded-3xl bg-surface px-8 py-15"
      >
        <p
          className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted"
          id="dashboard-analytics-snapshot-heading"
        >
          Followers
        </p>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <p className="text-5xl font-black leading-none tracking-tight text-foreground">
            -
          </p>
          <Button asChild className={challengeCtaClass} size="sm">
            <Link href="/platforms">Connect</Link>
          </Button>
        </div>
        <p className="mb-6 text-base text-muted">
          Link Instagram to see weekly follower change here.
        </p>
        <ProgressTrack fill={0} />
      </section>
    );
  }

  const delta =
    state.kind === "ready" ? state.snapshot.followerDeltaWeek : null;
  const followers = state.kind === "ready" ? state.snapshot.followers : 0;

  return (
    <section
      aria-labelledby="dashboard-analytics-snapshot-heading"
      className="rounded-3xl bg-surface px-8 py-15"
    >
      <p
        className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted"
        id="dashboard-analytics-snapshot-heading"
      >
        Followers
      </p>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <p className="text-5xl font-black leading-none tracking-tight text-foreground">
          {state.kind === "no-history"
            ? "-"
            : formatFollowerHero(delta, followers)}
        </p>
        <Button asChild className={challengeCtaClass} size="sm">
          <Link href="/analytics">See Insights</Link>
        </Button>
      </div>
      <ProgressTrack fill={followerDeltaShare(delta, followers)} />
    </section>
  );
}

function ChallengeSnapshotSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="dashboard-analytics-snapshot-heading"
      className="rounded-3xl bg-surface px-8 py-15"
    >
      <p
        className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted"
        id="dashboard-analytics-snapshot-heading"
      >
        Followers
      </p>
      <div aria-hidden className="animate-pulse space-y-4">
        <div className="h-10 w-32 rounded bg-foreground/10" />
        <div className="h-1.5 w-full rounded-full bg-foreground/10" />
      </div>
    </section>
  );
}

function ProgressTrack({ fill }: { fill: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${fill}%` }}
      />
    </div>
  );
}

function AnalyticsLink() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/analytics">
        View analytics
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </Button>
  );
}

function formatConnectedSince(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
