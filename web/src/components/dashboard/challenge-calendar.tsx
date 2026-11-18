import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calendarWindow,
  type ChallengeDay,
} from "@/lib/challenge-progress";

// One week of circular day cells, matching the design export. The full
// programme still lives on `days`; this strip only ever shows the current week.
export function ChallengeCalendar({ days }: { days: ChallengeDay[] }) {
  const currentDay =
    days.find((day) => day.state === "active")?.dayNumber ?? 0;
  const visibleDays = calendarWindow(days, currentDay);

  return (
    <ol
      aria-label="This week's challenge days"
      className="mb-4 flex list-none gap-3 overflow-x-auto p-0 pb-4"
    >
      {visibleDays.map((day) => (
        <li
          aria-current={day.state === "active" ? "date" : undefined}
          className={cn(
            "flex size-24 flex-shrink-0 flex-col items-center justify-center rounded-full bg-surface",
            day.state === "active" && "bg-accent text-accent-foreground",
            day.state === "upcoming" && "text-muted",
          )}
          key={day.date}
        >
          <span className="text-xs font-semibold uppercase">
            {day.weekdayLabel}
          </span>
          <span className="text-3xl font-semibold">{day.dayOfMonth}</span>
          {day.state === "completed" ? (
            <Check
              aria-label="Completed"
              className="size-3 text-success"
              strokeWidth={2.5}
            />
          ) : null}
          <span className="sr-only">
            Day {day.dayNumber}
            {day.state === "active" ? " - today" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
