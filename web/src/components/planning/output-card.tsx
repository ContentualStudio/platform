"use client";

import { Star } from "lucide-react";
import {
  formatLongDate,
  isDownloadable,
  OUTPUT_ICONS,
  OUTPUT_TYPE_LABELS,
  type TaskOutput,
} from "@/components/planning/data";
import { OutputCardBody } from "@/components/planning/output-card-body";
import { PlanningButton } from "@/components/planning/planning-button";
import { cn } from "@/lib/utils";

interface OutputCardProps {
  onDownload: (output: TaskOutput) => void;
  onToggleFavorite: (id: string) => void;
  onView: (output: TaskOutput) => void;
  output: TaskOutput;
}

export function OutputStatusBadge({ status }: { status: TaskOutput["status"] }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-px text-2xs font-semibold",
        status === "final"
          ? "bg-tint-green-soft text-tint-green"
          : "bg-tint-amber-soft text-tint-amber",
      )}
    >
      {status === "final" ? "Final" : "Draft"}
    </span>
  );
}

export function OutputCard({
  onDownload,
  onToggleFavorite,
  onView,
  output,
}: OutputCardProps) {
  const Icon = OUTPUT_ICONS[output.icon];

  return (
    <article className="relative flex flex-col gap-3 rounded-lg bg-background p-5 transition-shadow duration-200 ease-contentual hover:shadow-soft">
      <button
        aria-label={
          output.favorite
            ? `Remove ${output.name} from favourites`
            : `Add ${output.name} to favourites`
        }
        aria-pressed={output.favorite}
        className={cn(
          "absolute right-3 top-3 rounded p-1 transition-colors duration-200 ease-contentual",
          output.favorite
            ? "text-tint-amber"
            : "text-muted hover:text-tint-amber",
        )}
        onClick={() => onToggleFavorite(output.id)}
        type="button"
      >
        <Star className={cn("size-4", output.favorite && "fill-current")} />
      </button>

      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            output.tint,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {output.name}
          </h3>
          <p className="text-2xs font-semibold uppercase tracking-wide text-foreground">
            {OUTPUT_TYPE_LABELS[output.type]}
          </p>
        </div>
      </header>

      <div className="flex-1">
        <OutputCardBody type={output.type} />
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">
            {formatLongDate(output.lastModified)}
          </span>
          <OutputStatusBadge status={output.status} />
        </div>
        <div className="flex gap-1">
          <PlanningButton onClick={() => onView(output)}>View</PlanningButton>
          {isDownloadable(output.type) ? (
            <PlanningButton
              onClick={() => onDownload(output)}
              variant="primary"
            >
              Download
            </PlanningButton>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
