"use client";

import { Award, CalendarCheck, Flame, Lock, Target } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import {
  mergeAchievements,
  nextPossibleBadge,
  wallOrder,
  type AchievementBadge,
  type AchievementState,
} from "@/lib/achievements";
import { badgeCatalogue, badgeCategoryLabels } from "@/lib/badge-catalogue";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import type { UserAchievements } from "@/lib/server-achievements";
import { cn } from "@/lib/utils";

type Filter = "all" | AchievementState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "progress", label: "In progress" },
  { id: "locked", label: "Locked" },
];

const earnedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Programs › Achievements, design direction "Welcome 2": programme progress,
 * the next possible badge, then every badge ordered by what is closest to
 * unlock. Earned state comes from the user's real achievements.
 */
export function AchievementsPanel({
  progress,
  achievements,
}: {
  progress: ChallengeProgress;
  /** Null when the achievements could not be loaded. */
  achievements: UserAchievements | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const streak = achievements?.currentStreak ?? 0;
  const badges = mergeAchievements(badgeCatalogue, achievements?.badges ?? [], streak);
  const wall = wallOrder(badges);
  const next = nextPossibleBadge(badges);
  const earnedCount = badges.filter((badge) => badge.state === "earned").length;
  const counts: Record<Filter, number> = {
    all: badges.length,
    earned: earnedCount,
    progress: badges.filter((badge) => badge.state === "progress").length,
    locked: badges.filter((badge) => badge.state === "locked").length,
  };
  const visible = filter === "all" ? wall : wall.filter((badge) => badge.state === filter);

  return (
    <div className="flex flex-col gap-5.5">
      <header>
        <h2 className="text-4xl font-extrabold leading-heading tracking-tight text-foreground">Achievements</h2>
        <p className="mt-1 text-base text-muted">Every badge, ordered by what is closest to unlock.</p>
      </header>

      {achievements ? null : (
        <p className="rounded-2xl bg-surface px-5 py-4 text-sm text-muted" role="status">
          We couldn&apos;t load your badges, so all of them show as locked. Refresh to try again.
        </p>
      )}

      <ProgressStrip
        badgeCount={badges.length}
        earnedCount={earnedCount}
        progress={progress}
        streak={streak}
      />

      {next ? <NextBadge badge={next} /> : null}

      <section aria-labelledby="badge-wall-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold tracking-tight text-foreground" id="badge-wall-title">
            Badges
          </h3>
          <div aria-label="Filter badges" className="flex flex-wrap gap-2" role="group">
            {FILTERS.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                  filter === item.id
                    ? "bg-foreground text-background"
                    : "bg-surface text-muted hover:text-foreground",
                )}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label} <b className="font-extrabold">{counts[item.id]}</b>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-sm text-muted">No badges here yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((badge) => (
              <BadgeTile badge={badge} key={badge.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProgressStrip({
  progress,
  streak,
  earnedCount,
  badgeCount,
}: {
  progress: ChallengeProgress;
  streak: number;
  earnedCount: number;
  badgeCount: number;
}) {
  const totalWeeks = Math.max(1, Math.ceil(progress.totalDays / 7));
  const weeksDone = progress.hasStarted
    ? Math.min(totalWeeks, Math.floor(Math.max(progress.currentDay - 1, 0) / 7))
    : 0;
  const stats = [
    { icon: CalendarCheck, label: "Weeks completed", value: `${weeksDone}/${totalWeeks}` },
    { icon: Award, label: "Badges earned", value: `${earnedCount}/${badgeCount}` },
    { icon: Flame, label: "Current streak", value: `${streak} ${streak === 1 ? "day" : "days"}` },
    {
      icon: Target,
      label: "Programme day",
      value: progress.hasStarted ? `${progress.currentDay} of ${progress.totalDays}` : "Not started",
    },
  ];

  return (
    <section aria-label="Your progress" className="rounded-3xl bg-surface p-6">
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div className="flex flex-col gap-1.5" key={label}>
            <Icon aria-hidden className="size-5 text-accent" />
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-extrabold leading-none text-foreground tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex justify-between text-sm text-muted">
        <span>Programme progress</span>
        <span className="tabular-nums">{progress.progressPercent}%</span>
      </div>
      <div
        aria-label={`${progress.progressPercent}% of the programme complete`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-border"
        role="img"
      >
        <span className="block h-full rounded-full bg-success" style={{ width: `${progress.progressPercent}%` }} />
      </div>
    </section>
  );
}

function NextBadge({ badge }: { badge: AchievementBadge }) {
  return (
    <section
      aria-labelledby="next-badge-title"
      className="flex flex-col gap-6 rounded-3xl bg-surface p-6 sm:flex-row sm:items-center"
    >
      <BadgeArt badge={badge} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-extrabold uppercase tracking-wide text-accent">Next possible badge</p>
        <h3 className="mt-1 text-2xl font-bold text-foreground" id="next-badge-title">
          {badge.name}
        </h3>
        <p className="mt-1 text-sm text-muted">{badge.title}</p>
        {badge.progress ? <BadgeProgress progress={badge.progress} /> : null}
      </div>
    </section>
  );
}

function BadgeTile({ badge }: { badge: AchievementBadge }) {
  return (
    <li
      className={cn(
        "flex flex-col items-center rounded-2xl p-4 text-center",
        badge.state === "earned" ? "bg-tint-green-soft" : "bg-surface",
      )}
    >
      <BadgeArt badge={badge} size="md" />
      <p
        className={cn(
          "mt-3 text-sm font-bold",
          badge.state === "earned" ? "text-tint-green dark:text-foreground" : "text-foreground",
        )}
      >
        {badge.name}
      </p>
      {badge.category ? (
        <p className="mt-1 rounded-full bg-background px-2.5 py-0.5 text-2xs font-semibold text-muted">
          {badgeCategoryLabels[badge.category]}
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-normal text-muted">{badge.title}</p>
      {badge.progress ? <BadgeProgress progress={badge.progress} /> : null}
      <p
        className={cn(
          "mt-2 text-xs font-semibold",
          badge.state === "earned" ? "text-tint-green dark:text-foreground" : "text-muted",
        )}
      >
        {badge.state === "earned"
          ? badge.earnedAt
            ? `Earned ${earnedDate.format(new Date(badge.earnedAt))}`
            : "Earned"
          : badge.state === "progress"
            ? "In progress"
            : "Locked"}
      </p>
    </li>
  );
}

function BadgeArt({ badge, size }: { badge: AchievementBadge; size: "md" | "lg" }) {
  const box = size === "lg" ? "size-28" : "size-20";

  if (!badge.image) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-background text-muted", box)}>
        <Award aria-hidden className="size-8" />
      </span>
    );
  }

  return (
    <span className={cn("relative shrink-0", box)}>
      <Image
        alt=""
        className={cn(
          "size-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.18)]",
          badge.state === "locked" && "opacity-55 grayscale",
        )}
        height={size === "lg" ? 112 : 80}
        src={`/brand/badges/${badge.image}`}
        width={size === "lg" ? 112 : 80}
      />
      {badge.state === "locked" ? (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-foreground text-background">
          <Lock aria-hidden className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

function BadgeProgress({ progress }: { progress: { current: number; target: number } }) {
  const percent = Math.round((progress.current / progress.target) * 100);

  return (
    <div className="mt-3 w-full">
      <div
        aria-label={`${progress.current} of ${progress.target}`}
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="img"
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-xs font-semibold text-muted tabular-nums">
        {progress.current} of {progress.target} days in a row
      </p>
    </div>
  );
}
