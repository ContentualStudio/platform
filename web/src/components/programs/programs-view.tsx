"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AchievementsPanel } from "@/components/programs/achievements-panel";
import { DailyTasksPanel } from "@/components/programs/daily-tasks-panel";
import { EligibleProgrammesView } from "@/components/programs/eligible-programmes-view";
import { ProgrammeOverview } from "@/components/programs/programme-overview";
import { mergeAchievements, nextPossibleBadge, wallOrder } from "@/lib/achievements";
import { badgeCatalogue } from "@/lib/badge-catalogue";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import type { ProgramsTab } from "@/lib/programs";
import type { UserAchievements } from "@/lib/server-achievements";
import { cn } from "@/lib/utils";
import type { Programme } from "@/schemas/challenge-setup.schema";
import type { EligibleProgramme } from "@/schemas/eligible-programme.schema";
import type {
  ProgrammeTask,
  ProgrammeTaskProgress,
} from "@/schemas/programme-task.schema";

const PROGRAMME_TABS: { id: ProgramsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Daily Tasks" },
  { id: "achievements", label: "Achievements" },
  { id: "programmes", label: "All Programmes" },
];

// With nothing under way the programme tabs have nothing to show, so the
// catalogue is the page.
const NO_PROGRAMME_TABS: { id: ProgramsTab; label: string }[] = [
  { id: "programmes", label: "All Programmes" },
];

type ProgramsViewProps = {
  initialTab: ProgramsTab;
  /** Null when the eligible list could not be loaded. */
  programmes: EligibleProgramme[] | null;
} & (
  | {
      programme: Programme;
      progress: ChallengeProgress;
      achievements: UserAchievements | null;
      tasks: ProgrammeTask[];
      taskProgress: ProgrammeTaskProgress[];
    }
  | {
      programme: null;
      progress?: undefined;
      achievements?: undefined;
      tasks?: undefined;
      taskProgress?: undefined;
    }
);

export function ProgramsView(props: ProgramsViewProps) {
  const { initialTab, programmes } = props;
  const hasProgramme = props.programme !== null;
  const tabs = hasProgramme ? PROGRAMME_TABS : NO_PROGRAMME_TABS;
  const router = useRouter();
  const [tab, setTab] = useState<ProgramsTab>(
    hasProgramme ? initialTab : "programmes",
  );

  useEffect(() => {
    setTab(hasProgramme ? initialTab : "programmes");
  }, [hasProgramme, initialTab]);

  const selectTab = useCallback(
    (next: ProgramsTab) => {
      setTab(next);
      const query = next === "overview" ? "/programs" : `/programs?tab=${next}`;
      router.replace(query, { scroll: false });
    },
    [router],
  );

  return (
    <div className="w-full">
      <ProgramsTabNav onSelect={selectTab} tab={tab} tabs={tabs} />

      {props.programme !== null && tab === "overview" ? (
        <ProgrammeOverview
          achievements={<PotentialAchievements achievements={props.achievements} />}
          onSeeTasks={() => selectTab("tasks")}
          programme={props.programme}
          progress={props.progress}
        />
      ) : null}
      {props.programme !== null && tab === "tasks" ? (
        <DailyTasksPanel
          programmeTitle={props.programme.title}
          progress={props.progress}
          taskProgress={props.taskProgress}
          tasks={props.tasks}
        />
      ) : null}
      {props.programme !== null && tab === "achievements" ? (
        <AchievementsPanel achievements={props.achievements} progress={props.progress} />
      ) : null}
      {tab === "programmes" ? (
        programmes ? (
          <EligibleProgrammesView embedded programmes={programmes} />
        ) : (
          <p className="rounded-2xl bg-surface p-6 text-sm text-muted">
            We couldn&apos;t load the programmes available to you. Refresh to
            try again.
          </p>
        )
      ) : null}
    </div>
  );
}

function ProgramsTabNav({
  onSelect,
  tab,
  tabs,
}: {
  onSelect: (tab: ProgramsTab) => void;
  tab: ProgramsTab;
  tabs: { id: ProgramsTab; label: string }[];
}) {
  return (
    <nav
      aria-label="Program sections"
      className="-mx-1 mb-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        className="flex min-w-max border-b border-border"
        role="tablist"
      >
        {tabs.map((item, index) => {
          const selected = tab === item.id;

          return (
            <button
              aria-selected={selected}
              className={cn(
                "relative whitespace-nowrap px-5 py-2.5 text-sm font-semibold text-muted transition-colors duration-150 hover:text-foreground focus-visible:z-10 focus-visible:text-foreground",
                index === 0 && "pl-0",
                selected && "text-foreground",
              )}
              key={item.id}
              onClick={() => onSelect(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
              {selected ? (
                <span
                  className={cn(
                    "absolute -bottom-px h-0.5 bg-accent",
                    index === 0 ? "left-0 right-5" : "left-5 right-5",
                  )}
                />
              ) : null}
            </button>
          );
        })}
        <Link
          className="ml-auto whitespace-nowrap px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground"
          href="/programs/history"
        >
          History
        </Link>
      </div>
    </nav>
  );
}

// The badges this programme can earn next, from the user's real achievements:
// the closest to unlock first, then the rest not yet earned.
function PotentialAchievements({ achievements }: { achievements: UserAchievements | null }) {
  const merged = mergeAchievements(
    badgeCatalogue,
    achievements?.badges ?? [],
    achievements?.currentStreak ?? 0,
  );
  const next = nextPossibleBadge(merged);
  const rest = wallOrder(merged)
    .filter((badge) => badge.state !== "earned" && badge.id !== next?.id && badge.image)
    .slice(0, 4);

  if (!next) {
    return null;
  }

  return (
    <section
      aria-labelledby="potential-achievements-title"
      className="rounded-3xl bg-surface p-7"
    >
      <h2
        className="mb-5 text-2xl font-semibold tracking-tight text-foreground"
        id="potential-achievements-title"
      >
        Potential Achievements
      </h2>
      <div className="flex flex-col gap-7 md:flex-row md:items-center">
        <div className="flex items-center gap-5 md:w-[40%]">
          <Image
            alt=""
            className="size-28 shrink-0 drop-shadow-[0_10px_22px_rgba(0,0,0,0.18)]"
            height={112}
            src={`/brand/badges/${next.image}`}
            width={112}
          />
          <div>
            <p className="text-2xs font-extrabold uppercase tracking-[0.1em] text-accent">
              Next possible badge
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{next.name}</p>
            <p className="mt-1 text-sm text-muted">{next.title}</p>
          </div>
        </div>
        <ul className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          {rest.map((badge) => (
            <li className="flex flex-col items-center text-center" key={badge.name}>
              <Image
                alt=""
                className="size-20 opacity-90"
                height={80}
                src={`/brand/badges/${badge.image}`}
                width={80}
              />
              <p className="mt-2 text-sm font-semibold text-foreground">
                {badge.name}
              </p>
              <p className="text-xs text-muted">{badge.title}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
