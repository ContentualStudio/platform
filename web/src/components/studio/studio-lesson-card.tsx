"use client";

import * as React from "react";
import { ChevronDown, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { studioDurationLabel, type StudioLessonCardModel } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiBaseUrl } from "@/lib/api-client";
import {
  studioLessonDetailSchema,
  type StudioLessonDetail,
} from "@/lib/studio-lesson";
import { LessonContent, LessonFailure } from "./lesson-content";
import { tierDisplayName } from "@/schemas/billing.schema";

/**
 * The Studio's primary action styling. Exported because the same treatment is
 * needed on `<Link>`s (Browse all lessons) where a <button> is wrong — one
 * source of truth beats re-pasting the class string per call site.
 */
export const studioPrimaryButtonClass =
  "inline-flex min-h-[42px] items-center justify-center rounded-full bg-accent px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(249,86,22,0.18)] transition-[transform,background] hover:-translate-y-px hover:bg-[#e9470b]";

export function StudioPrimaryButton({
  children,
  className,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button";
}) {
  return (
    <button
      className={cn(studioPrimaryButtonClass, className)}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function StudioSecondaryButton({
  children,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button";
}) {
  return (
    <button
      className="inline-flex min-h-[42px] items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:border-foreground"
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function StudioFilterField({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const hasValue = value !== "all";

  return (
    <div className="min-w-0">
      <label
        className="mb-1.5 block ps-0.5 text-[10px] font-extrabold uppercase tracking-[0.07em] text-muted"
        htmlFor={id}
      >
        {label}
      </label>
      <div
        className={cn(
          "relative h-11 rounded-xl border border-border bg-background transition-[border-color,box-shadow,background]",
          hasValue && "border-accent/60 bg-accent/5",
        )}
      >
        <select
          className="size-full cursor-pointer appearance-none bg-transparent px-3.5 pe-10 text-[13px] font-bold text-foreground outline-none"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}

export function StudioLessonCard({
  lesson,
  onOpen,
}: {
  lesson: StudioLessonCardModel;
  onOpen: (lesson: StudioLessonCardModel) => void;
}) {
  return (
    <button
      aria-label={`Open ${lesson.title}`}
      className="group flex w-full flex-col overflow-hidden rounded-[26px] bg-background text-left shadow-[0_0_0_1px_var(--border),0_12px_36px_rgba(20,20,20,0.045)] transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(249,86,22,0.5),0_18px_42px_rgba(20,20,20,0.09)]"
      onClick={() => onOpen(lesson)}
      type="button"
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="(min-width: 900px) 33vw, 100vw"
          src={lesson.image}
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-black/10" />
        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-[rgba(18,18,18,0.78)] px-2.5 py-1.5 text-[11px] font-extrabold text-white backdrop-blur-sm">
          {lesson.formatLabel}
        </span>
        {lesson.locked ? (
          <span className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1.5 text-xs font-extrabold text-accent-foreground">
            <Lock aria-hidden className="size-3" />
            {tierDisplayName(lesson.minimumTier)}
          </span>
        ) : null}
      </div>
      <span className="flex flex-1 flex-col p-5">
        <h3 className="mb-2 text-[19px] leading-tight tracking-[-0.015em] text-foreground">
          {lesson.title}
        </h3>
        <p className="text-[13px] leading-snug text-muted">{lesson.summary}</p>
        <span className="mt-[18px] flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#fff0e9] px-2.5 py-1.5 text-[11px] font-bold text-[#ad1d07] dark:bg-[#4a2114] dark:text-[#ffad86]">
            {lesson.platformLabel}
          </span>
          {lesson.matched ? (
            <span className="rounded-full bg-[#e8f7ef] px-2.5 py-1.5 text-[11px] font-bold text-[#216a49] dark:bg-[#173a29] dark:text-[#89ddb3]">
              Matches your day
            </span>
          ) : null}
          <span className="rounded-full bg-surface px-2.5 py-1.5 text-[11px] font-bold text-muted">
            {lesson.level}
          </span>
        </span>
        <span className="mt-auto flex justify-between gap-3 pt-[18px] text-[11px] font-semibold text-muted">
          <span>{lesson.durationLabel}</span>
          <span>{lesson.topicLabel}</span>
        </span>
      </span>
    </button>
  );
}

export function StudioEmptyPanel({
  action,
  message,
}: {
  action?: React.ReactNode;
  /** Optional: omit when the section heading above already explains the state,
   * so the same sentence is not printed twice. */
  message?: string;
}) {
  return (
    <div className="rounded-[26px] border border-dashed border-border px-6 py-12 text-center">
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {action ? (
        <div className={cn("flex justify-center", message && "mt-5")}>
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** Upgrade prompt for a locked lesson; the api has already withheld the body. */
function LessonGate({
  lesson,
}: {
  lesson: Pick<StudioLessonCardModel, "id" | "title" | "minimumTier" | "image">;
}) {
  const plan = tierDisplayName(lesson.minimumTier);

  return (
    <div className="grid items-center gap-7 rounded-3xl bg-surface p-7 min-[760px]:grid-cols-[0.75fr_1.25fr]">
      <div className="relative flex min-h-55 items-center justify-center overflow-hidden rounded-xl bg-foreground-soft text-background">
        <Image
          alt=""
          className="object-cover opacity-40 blur-[6px]"
          sizes="(min-width: 760px) 320px, 100vw"
          fill
          src={lesson.image}
        />
        <span className="relative z-1 grid size-16 place-items-center rounded-full bg-background/15 backdrop-blur-sm">
          <Lock aria-hidden className="size-7" />
        </span>
      </div>
      <div>
        <p className="text-xs font-extrabold uppercase text-accent">
          {plan} lesson
        </p>
        <h3 className="mt-2 text-2xl text-foreground">
          Unlock the full lesson
        </h3>
        <p className="mt-2.5 leading-relaxed text-muted">
          You can see this lesson because the whole Studio library is open to
          browse. Its full content opens on the {plan} plan.
        </p>
        <Link
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href="/settings/account"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("lesson", lesson.id);
            window.history.replaceState(null, "", url.pathname + url.search);
          }}
        >
          View {plan} plan
        </Link>
      </div>
    </div>
  );
}

export function LessonDialog({
  lesson,
  onClose,
  initialLessonId,
}: {
  lesson: StudioLessonCardModel | null;
  onClose: () => void;
  initialLessonId?: string | null;
}) {
  const id = lesson?.id ?? initialLessonId;
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {id ? <LessonDetail key={id} id={id} card={lesson} /> : null}
    </Dialog>
  );
}

function LessonDetail({
  id,
  card,
}: {
  id: string;
  card: StudioLessonCardModel | null;
}) {
  const opener = React.useRef<HTMLElement | null>(null);
  const [detail, setDetail] = React.useState<StudioLessonDetail | null>(null);
  const [state, setState] = React.useState<
    "loading" | "success" | "error" | "missing"
  >("loading");
  const [attempt, setAttempt] = React.useState(0);
  function retry() {
    setAttempt((value) => value + 1);
  }
  React.useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setDetail(null);
    fetch(`${apiBaseUrl}/studio/lessons/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setState("missing");
          return;
        }
        if (!response.ok) throw new Error("Lesson failed to load");
        const parsed = studioLessonDetailSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setDetail(parsed);
          setState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [id, attempt]);
  const title =
    detail?.title ??
    card?.title ??
    (state === "missing"
      ? "This lesson is no longer available"
      : "Studio lesson");
  const gateCard = detail
    ? {
        id: detail.id,
        title: detail.title,
        minimumTier: detail.minimumTier,
        image: card?.image ?? "/brand/auth/creator-phone.jpg",
      }
    : null;
  return (
    <DialogContent
      onOpenAutoFocus={() => {
        opener.current = document.activeElement as HTMLElement | null;
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        opener.current?.focus();
      }}
      aria-describedby={undefined}
      className="top-auto bottom-0 left-0 max-h-[94dvh] w-full max-w-none sm:max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-3xl rounded-b-none border-0 p-0 md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[90dvh] md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
    >
      <header className="border-b border-border px-6 pb-5 pt-7 pr-12 md:px-8 md:pr-14">
        <p className="text-xs font-bold uppercase text-accent">
          {detail?.lessonType ?? card?.format ?? "Studio"} lesson
        </p>
        <DialogTitle className="mt-2 text-2xl md:text-3xl">{title}</DialogTitle>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {(detail?.platforms ?? card?.platforms ?? []).map((platform) => (
            <span className="rounded-full bg-surface px-3 py-1" key={platform}>
              {platform}
            </span>
          ))}
          <span className="rounded-full bg-surface px-3 py-1">
            {detail?.skillLevel ?? card?.level}
          </span>
          {detail || card ? (
            <span className="rounded-full bg-surface px-3 py-1">
              {card?.durationLabel ??
                (detail
                  ? studioDurationLabel(detail.lessonType, detail.summary)
                  : "")}
            </span>
          ) : null}
        </div>
      </header>
      <div className="px-6 py-7 md:px-8">
        {state === "loading" ? (
          <div
            role="status"
            aria-label="Loading lesson"
            className="space-y-4 motion-safe:animate-pulse"
          >
            <div className="aspect-video rounded-3xl bg-surface" />
            <div className="h-4 w-3/4 rounded-full bg-surface" />
            <div className="h-4 w-1/2 rounded-full bg-surface" />
          </div>
        ) : null}
        {state === "missing" ? (
          <div className="py-8 text-center">
            <h3 className="text-xl">Lesson not found</h3>
            <p className="mt-3 text-muted">
              It may have been unpublished or moved. Close this lesson to return
              to the library.
            </p>
          </div>
        ) : null}
        {state === "error" ? (
          <LessonFailure
            message="We couldn't load this lesson. Check your connection and try again."
            retry={retry}
          />
        ) : null}
        {state === "success" && detail ? (
          detail.locked && gateCard ? (
            <LessonGate lesson={gateCard} />
          ) : (
            <LessonContent key={attempt} lesson={detail} retry={retry} />
          )
        ) : null}
      </div>
    </DialogContent>
  );
}
