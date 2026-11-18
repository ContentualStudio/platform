import { resolveTimezone } from "./challenge-progress";
import type {
  ProgrammeHistory,
  ProgrammeHistoryEntry,
} from "../schemas/programme-history.schema";

/** Shown in place of a programme that is no longer in the catalogue. */
export const RETIRED_PROGRAMME_TITLE = "Programme unavailable";

export type HistoryTab = "progress" | "past" | "unavailable";

export const HISTORY_TABS: readonly { id: HistoryTab; label: string }[] = [
  { id: "progress", label: "In progress" },
  { id: "past", label: "Past" },
  { id: "unavailable", label: "Unavailable" },
];

/**
 * How a row reads: its colour, its status label, whether it links anywhere.
 * A programme missing from the catalogue is unavailable whatever its status,
 * because there is no content left to show for it.
 */
export type HistoryTone = "progress" | "completed" | "ended" | "unavailable";

export function historyTone(entry: ProgrammeHistoryEntry): HistoryTone {
  if (entry.title === null) {
    return "unavailable";
  }

  switch (entry.status) {
    case "active":
      return "progress";
    case "completed":
      return "completed";
    case "abandoned":
      return "ended";
  }
}

export function historyTitle(entry: ProgrammeHistoryEntry): string {
  return entry.title ?? RETIRED_PROGRAMME_TITLE;
}

export function historyStatusLabel(entry: ProgrammeHistoryEntry): string {
  switch (historyTone(entry)) {
    case "progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "ended":
      return "Ended early";
    case "unavailable":
      return "Unavailable";
  }
}

/** The rows under each tab: the API's in-progress / past split, less the unavailable ones. */
export function historyTabs(
  history: ProgrammeHistory,
): Record<HistoryTab, ProgrammeHistoryEntry[]> {
  const available = (entry: ProgrammeHistoryEntry) =>
    historyTone(entry) !== "unavailable";

  return {
    progress: history.inProgress.filter(available),
    past: history.past.filter(available),
    unavailable: [...history.inProgress, ...history.past].filter(
      (entry) => !available(entry),
    ),
  };
}

/** Opens on the first tab with something in it. */
export function initialHistoryTab(
  tabs: Record<HistoryTab, ProgrammeHistoryEntry[]>,
): HistoryTab {
  return HISTORY_TABS.find((tab) => tabs[tab.id].length > 0)?.id ?? "progress";
}

/**
 * "3 Sep 2026" in the user's own timezone, so a journey started late in the
 * evening does not show as the next day. An unknown or missing timezone falls
 * back to UTC.
 */
export function formatHistoryDate(iso: string, timezone: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: resolveTimezone(timezone),
  }).format(new Date(iso));
}
