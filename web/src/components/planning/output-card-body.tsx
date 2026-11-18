import { Play } from "lucide-react";
import type { OutputType } from "@/components/planning/data";

/** Document lines, with the first one accented like a title. */
function TemplateBody() {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4">
      <div className="h-2 w-2/5 rounded-sm bg-accent opacity-25" />
      <div className="h-2 w-full rounded-sm bg-border" />
      <div className="h-2 w-4/5 rounded-sm bg-border" />
      <div className="h-2 w-3/5 rounded-sm bg-border" />
    </div>
  );
}

const PILLARS = [
  { color: "var(--ds-tint-red)", hint: "How-to", label: "Tutorials" },
  { color: "var(--ds-tint-amber)", hint: "Behind scenes", label: "BTS" },
  { color: "var(--ds-tint-green)", hint: "Commentary", label: "Industry" },
];

function BoardBody() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PILLARS.map((pillar) => (
        <div className="rounded-lg bg-surface px-3 py-2" key={pillar.label}>
          <div
            className="mb-1 size-2 rounded-full"
            style={{ background: pillar.color }}
          />
          <div className="text-xs font-semibold text-foreground">
            {pillar.label}
          </div>
          <div className="text-2xs text-muted">{pillar.hint}</div>
        </div>
      ))}
    </div>
  );
}

// Fixed waveform silhouette — a real recording would drive these heights.
const WAVE_HEIGHTS = ["55%", "75%", "100%", "45%"];
const WAVE_OPACITIES = [0.2, 0.35, 0.5];

function RecordingBody() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
      <div className="flex h-9 flex-1 items-end gap-0.5">
        {Array.from({ length: 20 }, (_, index) => (
          <div
            className="flex-1 rounded-none bg-accent"
            key={index}
            style={{
              height: WAVE_HEIGHTS[index % 4],
              opacity: WAVE_OPACITIES[index % 3],
            }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <Play className="size-3 fill-current" />
      </span>
    </div>
  );
}

const PLAN_WEEKS = [
  { filled: 7, label: "W1" },
  { filled: 7, label: "W2" },
  { filled: 3, label: "W3" },
  { filled: 0, label: "W4" },
];

function PlanBody() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      {PLAN_WEEKS.map((week) => (
        <div className="flex items-center gap-2" key={week.label}>
          <span className="w-7 shrink-0 text-right text-2xs font-semibold text-muted">
            {week.label}
          </span>
          <div className="flex flex-1 gap-0.5">
            {Array.from({ length: 7 }, (_, day) => (
              <div
                className={
                  day < week.filled
                    ? "h-4 flex-1 rounded-xs bg-accent opacity-30"
                    : "h-4 flex-1 rounded-xs bg-border"
                }
                key={day}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="my-1 h-1 rounded-sm bg-border">
        <div className="h-full w-3/5 rounded-sm bg-accent opacity-50" />
      </div>
    </div>
  );
}

/** The mini visual that tells each output type apart at a glance. */
export function OutputCardBody({ type }: { type: OutputType }) {
  switch (type) {
    case "template": {
      return <TemplateBody />;
    }
    case "board": {
      return <BoardBody />;
    }
    case "recording": {
      return <RecordingBody />;
    }
    case "plan": {
      return <PlanBody />;
    }
  }
}
