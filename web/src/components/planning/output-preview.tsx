"use client";

import { X } from "lucide-react";
import {
  formatLongDate,
  isDownloadable,
  OUTPUT_ICONS,
  OUTPUT_TYPE_LABELS,
  type TaskOutput,
} from "@/components/planning/data";
import { OutputStatusBadge } from "@/components/planning/output-card";
import { PlanningButton } from "@/components/planning/planning-button";
import { PlanningModal } from "@/components/planning/planning-modal";
import { cn } from "@/lib/utils";

interface OutputPreviewProps {
  onClose: () => void;
  onDownload: (output: TaskOutput) => void;
  onDuplicate: (output: TaskOutput) => void;
  onEdit: (output: TaskOutput) => void;
  output: TaskOutput;
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function OutputPreview({
  onClose,
  onDownload,
  onDuplicate,
  onEdit,
  output,
}: OutputPreviewProps) {
  const Icon = OUTPUT_ICONS[output.icon];

  return (
    <PlanningModal
      className="w-[560px] max-h-[80vh] gap-0 p-0"
      labelledBy="output-preview-title"
      onClose={onClose}
    >
      <header className="flex items-center gap-3 border-b border-border px-6 py-5">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            output.tint,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-base font-semibold text-foreground"
            id="output-preview-title"
          >
            {output.name}
          </h2>
          <span className="mt-0.5 inline-block rounded bg-surface px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-foreground">
            {OUTPUT_TYPE_LABELS[output.type]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PlanningButton onClick={() => onDuplicate(output)}>
            Duplicate
          </PlanningButton>
          <PlanningButton onClick={() => onEdit(output)}>Edit</PlanningButton>
          {isDownloadable(output.type) ? (
            <PlanningButton onClick={() => onDownload(output)} variant="primary">
              Download
            </PlanningButton>
          ) : null}
          <button
            aria-label="Close preview"
            className="flex size-8 items-center justify-center rounded-full text-muted transition-colors duration-200 ease-contentual hover:bg-surface hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="size-4.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Description
          </span>
          <p className="text-sm leading-loose text-foreground">
            {output.preview}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <MetaItem label="Created" value={formatLongDate(output.createdAt)} />
          <MetaItem
            label="Last modified"
            value={formatLongDate(output.lastModified)}
          />
          <MetaItem label="Task" value={output.task} />
          <MetaItem
            label="Status"
            value={<OutputStatusBadge status={output.status} />}
          />
        </div>
      </div>
    </PlanningModal>
  );
}
