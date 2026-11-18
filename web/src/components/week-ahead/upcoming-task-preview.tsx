import Link from "next/link";
import { ArrowLeft, Camera, Clock, Send } from "lucide-react";
import { checklistStepsFromTask, richTextText } from "@/lib/programme-tasks";
import { cn } from "@/lib/utils";
import type { ProgrammeTask } from "@/schemas/programme-task.schema";

const DAY_TYPE_LABELS: Record<string, string> = {
  push: "Push",
  protect: "Protect",
  recharge: "Recharge",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
};

/**
 * A day the user has not reached yet, shown exactly as authored and with no
 * actions on it. Completing or skipping stays on today's card — a future day
 * cannot be resolved early.
 */
export function UpcomingTaskPreview({
  dayNumber,
  task,
}: {
  dayNumber: number;
  task: ProgrammeTask;
}) {
  const dayType = task.dayType ? DAY_TYPE_LABELS[task.dayType] : null;
  const platform = task.platform ? PLATFORM_LABELS[task.platform] : null;
  const objective = task.objective?.trim();
  const openingLine = task.openingLine?.trim();
  const whyItMatters = richTextText(task.whyItMatters);
  const outputDescription = richTextText(task.outputDescription);
  const steps = checklistStepsFromTask(task);

  return (
    <main className="w-full pb-14">
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-foreground"
        href="/week-ahead"
      >
        <ArrowLeft aria-hidden className="size-4" />
        The week ahead
      </Link>

      <article className="rounded-2xl bg-surface p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Day {dayNumber} · Preview
        </p>
        <h1 className="mt-2 text-fluid-sm font-black leading-snug tracking-tight text-foreground">
          {task.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {dayType ? (
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-2xs font-extrabold uppercase",
                task.dayType === "push" && "bg-accent/12 text-accent",
                task.dayType === "protect" && "bg-success/15 text-success",
                task.dayType === "recharge" && "bg-control text-muted",
              )}
            >
              {dayType}
            </span>
          ) : null}
          {task.contentType ? (
            <Chip className="capitalize">{task.contentType}</Chip>
          ) : null}
          {platform ? <Chip>{platform}</Chip> : null}
          {task.cameraRequired ? (
            <Chip>
              <Camera aria-hidden className="size-3.5" />
              Camera needed
            </Chip>
          ) : null}
          {task.publishSlot ? (
            <Chip>
              <Send aria-hidden className="size-3.5" />
              Publish slot
            </Chip>
          ) : null}
          {typeof task.timeEstimateMinutes === "number" ? (
            <Chip>
              <Clock aria-hidden className="size-3.5" />
              About {task.timeEstimateMinutes} min
            </Chip>
          ) : null}
        </div>

        {objective ? <Section title="Objective">{objective}</Section> : null}
        {openingLine ? (
          <Section title="Opening line">{openingLine}</Section>
        ) : null}
        {whyItMatters ? (
          <Section title="Why it matters">{whyItMatters}</Section>
        ) : null}
        {outputDescription ? (
          <Section title="What you end up with">{outputDescription}</Section>
        ) : null}

        {steps.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Steps
            </h2>
            <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-base text-foreground">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className="mt-8 text-sm text-muted">
          This day has not arrived yet. You can complete or skip it from your
          daily task card on the day itself.
        </p>
      </article>
    </main>
  );
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-2xs font-bold text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-foreground">
        {children}
      </p>
    </section>
  );
}
