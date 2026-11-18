"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Compass, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPASS_PLATFORMS,
  COMPASS_RANGES,
  FORMATS,
  GAPS,
  HEATMAP,
  HEATMAP_DAYS,
  HEATMAP_SLOTS,
  HOOKS,
  SAMPLE_NICHE,
  USUAL_POST_SLOT,
  opportunityScore,
  postsAnalysed,
  rangeGrowthMultiplier,
  topicsFor,
  type CompassLens,
  type CompassPlatform,
  type CompassRange,
  type Topic,
} from "./compass-data";

export function ContentCompass() {
  const [platform, setPlatform] = React.useState<CompassPlatform>("all");
  const [range, setRange] = React.useState<CompassRange>("30d");
  const [lens, setLens] = React.useState<CompassLens>("niche");

  const formats = FORMATS[platform];
  const topics = topicsFor(platform, range);
  const posts = postsAnalysed(platform, range);

  return (
    <section
      aria-labelledby="content-compass-title"
      className="rounded-lg bg-surface p-6"
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            className="mb-0.5 flex items-center gap-2 text-2xl font-semibold text-foreground"
            id="content-compass-title"
          >
            Content Compass
            <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-accent-foreground">
              New
            </span>
          </h2>
          <p className="max-w-130 text-sm leading-loose text-muted">
            What&apos;s working in your niche right now, across the platforms you
            post on. Use it to decide <em>what</em> to make next.
          </p>
        </div>
        <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
          <span className="size-1.5 rounded-full bg-success" />
          Updated 2h ago · {posts.toLocaleString("en-GB")} posts analysed
        </p>
      </header>

      <p className="mb-5 flex items-start gap-2 rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-xs leading-normal text-muted">
        <Info aria-hidden className="mt-px size-4 shrink-0 text-accent" />
        Preview with sample data for the {SAMPLE_NICHE} niche. Your own niche
        analysis appears here once Compass is connected to your accounts.
      </p>

      <CompassFilters
        lens={lens}
        onLens={setLens}
        onPlatform={setPlatform}
        onRange={setRange}
        platform={platform}
        range={range}
      />

      <KpiRow formats={formats} range={range} topics={topics} />

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card
          className="xl:col-span-12"
          subtitle="Each direction is a topic in your niche. The further the shape reaches, the bigger the opportunity."
          title="Topic compass"
        >
          <TopicCompass topics={topics} />
        </Card>
        <Card
          className="xl:col-span-7"
          subtitle="Avg. engagement rate by format"
          title="Formats that are winning"
        >
          <FormatBars formats={formats} lens={lens} />
        </Card>
        <Card
          className="xl:col-span-5"
          subtitle="Biggest week-on-week growth in views"
          title="Rising topics"
        >
          <RisingTopics topics={topics} />
        </Card>
        <Card
          className="xl:col-span-12"
          subtitle="Opening-line patterns from top 10% posts"
          title="Hooks that are working"
        >
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {HOOKS[platform].map(([hook, lift, category]) => (
              <li
                className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-3"
                key={hook}
              >
                <q className="text-xs font-medium text-foreground">{hook}</q>
                <div className="flex items-center justify-between text-2xs text-muted">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-accent-foreground">
                    {category}
                  </span>
                  <span className="font-semibold text-accent">{lift.toFixed(1)}× avg.</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          className="xl:col-span-12"
          subtitle="Relative engagement by day & time, in your timezone"
          title="When your audience is most engaged"
        >
          <EngagementHeatmap />
        </Card>
        <Card
          action={
            <span className="rounded-lg bg-background px-2.5 py-1 text-xs font-semibold text-muted">
              {GAPS.length} opportunities
            </span>
          }
          className="xl:col-span-12"
          subtitle="Performing well in your niche, but you haven't made it yet - matched to your strongest format."
          title="Content Opportunity Gaps"
        >
          <OpportunityGaps />
        </Card>
      </div>
    </section>
  );
}

function CompassFilters({
  lens,
  onLens,
  onPlatform,
  onRange,
  platform,
  range,
}: {
  lens: CompassLens;
  onLens: (lens: CompassLens) => void;
  onPlatform: (platform: CompassPlatform) => void;
  onRange: (range: CompassRange) => void;
  platform: CompassPlatform;
  range: CompassRange;
}) {
  return (
    <div className="mb-4.5 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex items-center gap-2.5 rounded-full bg-foreground py-1.5 pr-4.5 pl-1.5 text-sm font-semibold text-background">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground">
            <Compass aria-hidden className="size-3.5" />
          </span>
          {SAMPLE_NICHE}
        </span>
        <div
          aria-label="Compare"
          className="flex rounded-full border border-border bg-background p-0.75"
          role="group"
        >
          {(
            [
              ["niche", "Niche view"],
              ["me", "Me vs niche"],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-pressed={lens === id}
              className={cn(
                "rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors",
                lens === id && "bg-foreground text-background",
              )}
              key={id}
              onClick={() => onLens(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <FilterGroup label="Platform">
          {COMPASS_PLATFORMS.map((item) => (
            <Chip
              active={platform === item.id}
              key={item.id}
              label={item.label}
              onClick={() => onPlatform(item.id)}
            />
          ))}
        </FilterGroup>
        <FilterGroup label="Time period">
          {COMPASS_RANGES.map((item) => (
            <Chip
              active={range === item.id}
              key={item.id}
              label={item.label}
              onClick={() => onRange(item.id)}
            />
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}

function FilterGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1.75" role="group" aria-label={label}>
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        active && "border-foreground font-semibold text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Card({
  action,
  children,
  className,
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <article className={cn("min-w-0 rounded-xl bg-background p-4", className)}>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

function KpiRow({
  formats,
  range,
  topics,
}: {
  formats: [string, number, number][];
  range: CompassRange;
  topics: Topic[];
}) {
  const top = formats[0];
  const rising = [...topics].sort((a, b) => b.growth - a.growth)[0];
  const nicheAverage = formats.reduce((sum, row) => sum + row[1], 0) / formats.length;
  const yourAverage = formats.reduce((sum, row) => sum + row[2], 0) / formats.length;
  const difference = ((yourAverage - nicheAverage) / nicheAverage) * 100;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi
        footer={`${top[1].toFixed(1)}% avg. engagement · +${Math.round(22 * rangeGrowthMultiplier(range))}%`}
        label="Top format"
        tone="ink"
        value={top[0]}
      />
      <Kpi
        footer={`↑ ${rising.growth}% views this period`}
        label="Fastest-rising topic"
        tone="accent"
        value={rising.name}
      />
      <Kpi
        footer="across your connected platforms"
        label="Niche avg. engagement"
        value={`${nicheAverage.toFixed(1)}%`}
      />
      <Kpi
        footer={
          <span className={difference >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {difference >= 0 ? "↑" : "↓"} {Math.abs(difference).toFixed(0)}% vs. niche
          </span>
        }
        label="Your avg. engagement"
        value={`${yourAverage.toFixed(1)}%`}
      />
    </div>
  );
}

function Kpi({
  footer,
  label,
  tone,
  value,
}: {
  footer: React.ReactNode;
  label: string;
  tone?: "ink" | "accent";
  value: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl bg-background p-4",
        tone === "ink" && "bg-foreground text-background",
        tone === "accent" && "bg-accent text-accent-foreground",
      )}
    >
      <p
        className={cn(
          "text-2xs font-semibold uppercase tracking-wide text-muted",
          tone && "text-current opacity-75",
        )}
      >
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-semibold tracking-tight">{value}</p>
      <p className={cn("mt-1.5 text-xs text-muted-foreground", tone && "text-current opacity-90")}>
        {footer}
      </p>
    </div>
  );
}

const RADAR_SIZE = 360;
const RADAR_CENTRE = RADAR_SIZE / 2;
const RADAR_RADIUS = 128;
const round2 = (value: number) => Math.round(value * 100) / 100;

function TopicCompass({ topics }: { topics: Topic[] }) {
  const scores = topics.map(opportunityScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const normalised = scores.map((score) => 0.14 + (0.81 * (score - min)) / (max - min || 1));
  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / topics.length - Math.PI / 2;
    // Rounded so the server and browser serialise identical coordinates;
    // their trig can differ in the last float digit and fail hydration.
    return [
      round2(RADAR_CENTRE + Math.cos(angle) * RADAR_RADIUS * value),
      round2(RADAR_CENTRE + Math.sin(angle) * RADAR_RADIUS * value),
    ] as const;
  };
  const polygon = (values: number[]) =>
    values.map((value, index) => point(index, value).join(",")).join(" ");
  const gaps = topics
    .map((topic, index) => ({ topic, gap: normalised[index] - topic.coverage }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 4);

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
      <svg
        aria-label="Radar of topic opportunity in your niche against your own coverage"
        className="mx-auto h-auto w-full max-w-110 overflow-visible"
        role="img"
        viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            className="fill-none stroke-border"
            key={ring}
            points={polygon(topics.map(() => ring))}
          />
        ))}
        {topics.map((topic, index) => {
          const [x, y] = point(index, 1);
          return (
            <line
              className="stroke-border"
              key={topic.name}
              x1={RADAR_CENTRE}
              x2={x}
              y1={RADAR_CENTRE}
              y2={y}
            />
          );
        })}
        <polygon
          className="fill-accent/25 stroke-accent"
          points={polygon(normalised)}
          strokeWidth={2}
        />
        <polygon
          className="fill-none stroke-foreground"
          points={polygon(topics.map((topic) => Math.max(0.04, topic.coverage)))}
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
        {topics.map((topic, index) => {
          const [x, y] = point(index, 1.2);
          const anchor = x < RADAR_CENTRE - 8 ? "end" : x > RADAR_CENTRE + 8 ? "start" : "middle";
          const isGap = gaps.some((row) => row.topic.name === topic.name);
          return (
            <text
              className={cn("fill-muted-foreground text-2xs", isGap && "fill-accent font-bold")}
              dominantBaseline="middle"
              key={topic.name}
              textAnchor={anchor}
              x={x}
              y={y}
            >
              {topic.name}
            </text>
          );
        })}
      </svg>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2.5">
            <span className="h-2.5 w-6.5 rounded-full bg-accent/40" />
            Niche opportunity
          </span>
          <span className="flex items-center gap-2.5">
            <span className="h-0 w-6.5 border-t-2 border-dashed border-foreground" />
            Your coverage
          </span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
            Biggest gaps for you
          </p>
          <ul>
            {gaps.map(({ topic, gap }) => (
              <li
                className="grid grid-cols-[1fr_70px_40px] items-center gap-2.5 border-t border-border py-1.75 text-xs first:border-t-0"
                key={topic.name}
              >
                <span className="text-foreground">{topic.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${Math.round(gap * 100)}%` }}
                  />
                </span>
                <span className="text-right font-semibold text-foreground">
                  {Math.round(gap * 100)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FormatBars({
  formats,
  lens,
}: {
  formats: [string, number, number][];
  lens: CompassLens;
}) {
  const max = Math.max(...formats.map(([, niche, you]) => Math.max(niche, you))) * 1.1;
  const compare = lens === "me";

  return (
    <>
      <ul className="flex flex-col gap-2.75">
        {formats.map(([name, niche, you], index) => {
          const difference = you - niche;
          return (
            <li
              className="grid grid-cols-[minmax(0,128px)_1fr_64px] items-center gap-2.5"
              key={name}
            >
              <span className="truncate text-xs text-foreground">{name}</span>
              <span className="relative h-4.5 rounded-md bg-surface">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md transition-[width] duration-300",
                    index === 0 ? "bg-accent" : "bg-accent/25",
                  )}
                  style={{ width: `${(niche / max) * 100}%` }}
                />
                {compare ? (
                  <span
                    className="absolute -inset-y-0.75 w-0.5 rounded-full bg-foreground transition-[left] duration-300"
                    style={{ left: `${(you / max) * 100}%` }}
                  />
                ) : null}
              </span>
              <span className="text-right text-xs font-semibold text-foreground">
                {niche.toFixed(1)}%
                {compare ? (
                  <small
                    className={cn(
                      "block text-2xs font-medium",
                      difference >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {difference >= 0 ? "+" : ""}
                    {difference.toFixed(1)} you
                  </small>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3.5 flex gap-3.5 text-2xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent/25" />
          Niche average
        </span>
        {compare ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-0.5 rounded-full bg-foreground" />
            You
          </span>
        ) : null}
      </div>
    </>
  );
}

function RisingTopics({ topics }: { topics: Topic[] }) {
  const rising = [...topics].sort((a, b) => b.growth - a.growth).slice(0, 6);

  return (
    <ol>
      {rising.map((topic, index) => (
        <li
          className="grid grid-cols-[18px_1fr_auto] items-center gap-2.5 border-t border-border py-2.25 first:border-t-0"
          key={topic.name}
        >
          <span className="text-xs text-muted">{index + 1}</span>
          <span className="text-xs font-medium text-foreground">
            {topic.name}
            <small className="mt-px block text-2xs font-normal text-muted">
              Demand {topic.demand} · Competition {topic.competition}
            </small>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              topic.growth >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {topic.growth >= 0 ? (
              <ArrowUpRight aria-hidden className="size-3.5" />
            ) : (
              <ArrowDownRight aria-hidden className="size-3.5" />
            )}
            {Math.abs(topic.growth)}%
          </span>
        </li>
      ))}
    </ol>
  );
}

function EngagementHeatmap() {
  const slots = HEATMAP.flatMap((row, day) =>
    row.map((value, slot) => ({ day, slot, value })),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 border-separate border-spacing-1 text-2xs text-muted">
          <thead>
            <tr>
              <th className="w-7.5" scope="col">
                <span className="sr-only">Day</span>
              </th>
              {HEATMAP_SLOTS.map((slot) => (
                <th className="pb-0.5 text-center font-normal" key={slot} scope="col">
                  {slot}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEATMAP.map((row, day) => (
              <tr key={HEATMAP_DAYS[day]}>
                <th className="text-left font-normal" scope="row">
                  {HEATMAP_DAYS[day]}
                </th>
                {row.map((value, slot) => {
                  const usual = USUAL_POST_SLOT[0] === day && USUAL_POST_SLOT[1] === slot;
                  return (
                    <td
                      aria-label={`${HEATMAP_DAYS[day]} ${HEATMAP_SLOTS[slot]}: ${Math.round(value * 100)}%${usual ? ", when you usually post" : ""}`}
                      className="relative h-6.5 rounded-md bg-accent"
                      key={HEATMAP_SLOTS[slot]}
                      style={{ opacity: 0.08 + value * 0.92 }}
                    >
                      {usual ? (
                        <span className="absolute top-1/2 left-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-foreground" />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs text-muted">
          Low
          <span className="h-2 w-30 rounded-full bg-[linear-gradient(90deg,var(--ds-accent-selection),var(--ds-accent))]" />
          High
          <span className="ml-3 inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-foreground" />
            When you usually post
          </span>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {slots.map(({ day, slot, value }, index) => (
          <li
            className={cn(
              "flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5",
              index === 0 && "border-accent/30 bg-accent/8",
            )}
            key={`${day}-${slot}`}
          >
            <span>
              <b className="text-xs font-semibold text-foreground">
                {HEATMAP_DAYS[day]} · {HEATMAP_SLOTS[slot]}
              </b>
              <small className="mt-0.5 block text-2xs text-muted">
                {Math.round(value * 100)}% relative engagement
              </small>
            </span>
            <span
              className={cn(
                "text-2xs font-bold uppercase tracking-wide text-muted",
                index === 0 && "text-accent",
              )}
            >
              #{index + 1}
            </span>
          </li>
        ))}
        <li className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs leading-normal text-muted-foreground">
          You usually post Wednesday at 12pm. Moving to Thursday evening could
          reach more of your audience.
        </li>
      </ol>
    </div>
  );
}

function OpportunityGaps() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {GAPS.map((gap) => (
        <li
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5"
          key={gap.topic}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">{gap.topic}</p>
              <p className="mt-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {gap.kicker}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
            <GapMeter label="Demand" value={gap.demand} />
            <GapMeter label="Competition" soft value={gap.competition} />
            <GapMeter label="Growth" value={gap.growth} />
            <p className="border-t border-border pt-2 text-xs leading-normal text-muted-foreground">
              Try: <i className="text-foreground">&ldquo;{gap.hook}&rdquo;</i>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-2xs text-muted">
            <span>
              {gap.format} · {gap.platform}
            </span>
            <span className="whitespace-nowrap rounded-md bg-accent/12 px-1.75 py-0.5 font-semibold text-accent">
              {gap.signal}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GapMeter({
  label,
  soft = false,
  value,
}: {
  label: string;
  soft?: boolean;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr_34px] items-center gap-2 text-2xs text-muted-foreground">
      <span>{label}</span>
      <span className="h-1.75 overflow-hidden rounded-full bg-border">
        <span
          className={cn("block h-full rounded-full bg-accent", soft && "bg-accent/45")}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
