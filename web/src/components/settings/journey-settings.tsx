"use client";

import * as React from "react";
import { CheckCheck, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import {
  SettingsOutlineButton,
} from "@/components/settings/settings-ui";
import {
  badgeCatalogue,
  badgeCategoryLabels,
  badgeCountsByCategory,
  levelTiers,
  type BadgeCategory,
  type BadgeDefinition,
} from "@/lib/badge-catalogue";
import type { AnalyticsSnapshotResponse } from "@/lib/analytics-snapshot";
import { deriveChallengeProgress } from "@/lib/challenge-progress";
import { getPlatformMark } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";
import type { ChallengeSetupStatus } from "@/schemas/challenge-setup.schema";
import type { ProfileResponse } from "@/schemas/onboarding.schema";

const NO_VALUE = "-";

const pointSources = [
  "Daily Tasks",
  "Week Completion",
  "Programmes",
  "Platform Connected",
  "Streaks",
  "Follower Milestones",
] as const;

type BadgeFilter = "all" | BadgeCategory;

function JourneyMetric({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <strong className="block text-[32px] font-extrabold leading-none tracking-[-0.03em] text-foreground">
        {value ?? NO_VALUE}
      </strong>
      <span className="mt-1.5 block text-[13px] text-muted">{label}</span>
    </div>
  );
}

function SocialLinks({ platforms }: { platforms: readonly string[] }) {
  const marks = platforms
    .map((platform) => ({ platform, mark: getPlatformMark(platform) }))
    .filter(
      (entry): entry is { mark: NonNullable<ReturnType<typeof getPlatformMark>>; platform: string } =>
        Boolean(entry.mark?.icon),
    );

  if (marks.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Focus platforms" className="flex flex-wrap gap-2.5">
      {marks.map(({ mark, platform }) => {
        const Icon = mark.icon!;

        return (
          <li key={platform}>
            <span
              className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-background"
              title={platform}
            >
              <Icon className={cn("size-5", mark.brandColor)} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LevelProgressCard() {
  return (
    <section
      aria-labelledby="level-progress-title"
      className="rounded-[22px] bg-surface p-7"
    >
      <h2
        className="mb-5 text-base font-bold text-foreground"
        id="level-progress-title"
      >
        Level Progress
      </h2>

      <div className="mb-5 flex items-center gap-4">
        <div
          aria-hidden
          className="flex size-[76px] shrink-0 items-center justify-center"
        >
          <Image
            alt=""
            className="size-full object-contain opacity-45 grayscale drop-shadow-[0_8px_12px_rgba(37,20,11,0.2)]"
            height={76}
            src="/brand/badges/champion.png"
            width={76}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">
            Level tracking not available yet
          </p>
          <p className="text-[13px] text-muted">
            Your XP and tier appear here once level tracking goes live.
          </p>
        </div>
      </div>

      <div
        aria-hidden
        className="mb-2 h-2 overflow-hidden rounded bg-border"
      >
        <div className="h-full w-0 rounded bg-accent" />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>XP to next level</span>
        <span>{NO_VALUE}</span>
      </div>

      <div
        aria-label="Level progression tiers"
        className="mt-[18px] grid grid-cols-5 gap-1.5"
      >
        {levelTiers.map((tier) => (
          <div
            className="min-w-0 rounded-[14px] px-1 py-2 text-center text-muted"
            key={tier.label}
          >
            <Image
              alt=""
              className="mx-auto mb-1.5 size-16 object-contain opacity-60 saturate-[0.65]"
              height={64}
              src={`/brand/badges/${tier.image}`}
              width={64}
            />
            <strong className="block truncate text-xs leading-tight">
              {tier.label}
            </strong>
            <span className="mt-0.5 block truncate text-2xs leading-tight">
              {tier.range}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-muted">
          Points Breakdown
        </p>
        <ul>
          {pointSources.map((source) => (
            <li
              className="flex items-center justify-between border-b border-border py-2 last:border-0"
              key={source}
            >
              <span className="text-[13px] font-medium text-foreground">
                {source}
              </span>
              <span className="text-[13px] font-bold text-accent">{NO_VALUE}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AchievementsSummaryCard() {
  const earnedCount = 0;
  const totalCount = badgeCatalogue.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((earnedCount / totalCount) * 100);

  return (
    <section
      aria-labelledby="achievements-title"
      className="rounded-[22px] bg-surface p-7"
    >
      <h2
        className="mb-4 text-base font-bold text-foreground"
        id="achievements-title"
      >
        Achievements
      </h2>

      <div className="mb-3 flex items-center justify-between gap-[18px]">
        <div>
          <strong className="block text-[34px] font-extrabold leading-none tracking-[-0.04em] text-foreground">
            {earnedCount}
          </strong>
          <span className="mt-1 block text-xs text-muted">
            of {totalCount} badges unlocked
          </span>
        </div>
        <div
          aria-label={`${progressPercent} percent of achievement badges unlocked`}
          className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-border"
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted">
        Recently unlocked
      </p>
      <p className="mb-4 text-sm text-muted">
        No badges unlocked yet - complete daily tasks to earn your first.
      </p>

      <p className="text-[13px] leading-relaxed text-muted">
        Keep showing up to unlock the rest of your collection.
      </p>
    </section>
  );
}

function BadgeCollectionSection() {
  const counts = badgeCountsByCategory();
  const [filter, setFilter] = React.useState<BadgeFilter>("all");

  const filters: Array<{ id: BadgeFilter; label: string }> = [
    { id: "all", label: `All · ${counts.get("all") ?? 0}` },
    {
      id: "consistency",
      label: `${badgeCategoryLabels.consistency} · ${counts.get("consistency") ?? 0}`,
    },
    {
      id: "programme",
      label: `Programmes · ${counts.get("programme") ?? 0}`,
    },
    {
      id: "growth",
      label: `${badgeCategoryLabels.growth} · ${counts.get("growth") ?? 0}`,
    },
    {
      id: "community",
      label: `${badgeCategoryLabels.community} · ${counts.get("community") ?? 0}`,
    },
    {
      id: "marketplace",
      label: `${badgeCategoryLabels.marketplace} · ${counts.get("marketplace") ?? 0}`,
    },
  ];

  const visibleBadges = badgeCatalogue.filter(
    (badge) => filter === "all" || badge.category === filter,
  );

  return (
    <section
      aria-labelledby="badge-collection-title"
      className="mb-9 rounded-[28px] bg-surface p-7"
    >
      <div className="mb-5 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h2
            className="text-xl font-extrabold tracking-[-0.02em] text-foreground"
            id="badge-collection-title"
          >
            Badge Collection
          </h2>
          <p className="mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-muted">
            Achievement badges celebrate consistency, programme progress,
            audience growth and community participation.
          </p>
        </div>
        <p className="shrink-0 text-xs font-bold text-muted">
          {totalBadgeLabel()}
        </p>
      </div>

      <div
        aria-label="Filter badge collection"
        className="mb-5 flex flex-wrap gap-2"
      >
        {filters.map((item) => (
          <button
            aria-pressed={filter === item.id}
            className={cn(
              "rounded-full border border-border bg-background px-[13px] py-2 text-[11px] font-bold text-muted transition-colors hover:border-muted-foreground hover:text-foreground",
              filter === item.id &&
                "border-accent bg-accent text-white hover:border-accent hover:text-white",
            )}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5 min-[720px]:grid-cols-3 min-[980px]:grid-cols-5">
        {visibleBadges.map((badge) => (
          <BadgeTile badge={badge} key={`${badge.category}-${badge.name}`} />
        ))}
      </div>
    </section>
  );
}

function totalBadgeLabel() {
  return `${badgeCatalogue.length} achievement badges`;
}

function BadgeTile({ badge }: { badge: BadgeDefinition }) {
  const stateLabel = badge.state === "earned" ? "Earned" : "Locked";

  return (
    <article
      className="relative flex min-h-[188px] flex-col items-center justify-start overflow-hidden rounded-[20px] border border-border bg-background px-2.5 pb-3 pt-3.5 text-center"
      title={badge.title}
    >
      <Image
        alt=""
        className={cn(
          "mb-1 size-[104px] object-contain drop-shadow-[0_8px_11px_rgba(37,20,11,0.16)] transition-transform hover:-translate-y-0.5",
          badge.state === "locked" &&
            "opacity-[0.42] grayscale filter drop-shadow-[0_5px_8px_rgba(37,20,11,0.1)]",
        )}
        height={104}
        src={`/brand/badges/${badge.image}`}
        width={104}
      />
      <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.06em] text-muted">
        {badgeCategoryLabels[badge.category]}
      </p>
      <p className="text-xs font-extrabold leading-tight text-foreground">
        {badge.name}
      </p>
      <p
        className={cn(
          "mt-1.5 text-[10px] font-bold text-muted",
          badge.state === "earned" && "text-success",
        )}
      >
        {stateLabel}
      </p>
    </article>
  );
}

interface HistoryEntry {
  completed: boolean;
  percent: number;
  title: string;
}

function ChallengeHistoryRow({ completed, percent, title }: HistoryEntry) {
  const Icon = completed ? CheckCheck : Clock;

  return (
    <li className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            completed
              ? "bg-[#E8FFE8] text-success"
              : "bg-accent-soft text-accent",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          <p
            className={cn(
              "text-xs",
              completed ? "text-muted" : "font-semibold text-accent",
            )}
          >
            {completed ? "Completed" : "In Progress"}
          </p>
        </div>
      </div>
      <span className="text-sm font-bold text-foreground">{percent}%</span>
    </li>
  );
}

export function JourneySettings({
  analytics,
  profile,
  setup,
}: {
  analytics: AnalyticsSnapshotResponse | null;
  profile: ProfileResponse;
  setup: ChallengeSetupStatus | null;
}) {
  const programme = setup?.assignedProgramme;
  const progress = deriveChallengeProgress({
    day1ScheduledFor: setup?.day1ScheduledFor ?? null,
    durationDays: programme?.durationDays,
    timezone: profile.stage1.timezone,
  });
  const displayName = profile.stage1.name || profile.user.name;
  const bio = profile.stage1.bio?.trim();
  const region = profile.stage1.region || "Region not set";
  const followers = analytics?.snapshot?.followers ?? null;
  const completed = setup?.programmeCompleted === true;
  const history: HistoryEntry[] = programme
    ? [
        {
          completed,
          percent: completed ? 100 : (progress?.progressPercent ?? 0),
          title: programme.title,
        },
      ]
    : [];

  return (
    <div className="w-full pb-11">
      <section
        aria-labelledby="journey-profile-title"
        className="mb-10 flex flex-col items-start gap-8 rounded-[28px] bg-surface p-7 min-[900px]:flex-row min-[900px]:items-center"
      >
        <div className="flex min-w-0 items-center gap-[22px]">
          <UserAvatar
            className="size-[88px] bg-[var(--ds-accent-gradient)] text-background"
            fallback="icon"
            image={profile.user.image}
            name={displayName}
          />
          <div className="min-w-0">
            <h2
              className="text-[30px] font-extrabold tracking-[-0.03em] text-foreground"
              id="journey-profile-title"
            >
              {displayName}
            </h2>
            <p className="mt-0.5 text-[15px] text-muted">{region}</p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <SettingsOutlineButton disabled type="button">
                Share
              </SettingsOutlineButton>
              <Link
                className="inline-flex min-h-0 items-center justify-center rounded-full border border-border bg-transparent px-5 py-2 text-[13px] font-bold text-foreground transition-colors hover:border-muted-foreground"
                href="/settings/profile"
              >
                Settings
              </Link>
            </div>
            {bio ? (
              <p className="mt-3 max-w-[440px] whitespace-pre-line text-sm leading-[1.55] text-muted">
                {bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-[244px] min-[900px]:ml-auto">
          <div className="mb-4 flex gap-9">
            <JourneyMetric label="Following" value={null} />
            <JourneyMetric
              label="Followers"
              value={
                followers === null ? null : followers.toLocaleString("en-US")
              }
            />
          </div>
          <SocialLinks platforms={profile.stage1.platforms ?? []} />
        </div>
      </section>

      <div className="mb-9 grid gap-7 min-[980px]:grid-cols-[0.9fr_1.1fr]">
        <LevelProgressCard />
        <AchievementsSummaryCard />
      </div>

      <BadgeCollectionSection />

      <section aria-labelledby="challenge-history-title">
        <h2
          className="mb-4 text-xl font-bold tracking-[-0.02em] text-foreground"
          id="challenge-history-title"
        >
          Challenge History
        </h2>
        <div className="rounded-[22px] bg-surface p-6">
          {history.length === 0 ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center">
              <Clock aria-hidden className="size-10 text-muted opacity-40" />
              <p className="text-sm text-muted">
                No programmes yet. Start your first challenge!
              </p>
            </div>
          ) : (
            <ul>
              {history.map((entry) => (
                <ChallengeHistoryRow key={entry.title} {...entry} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
