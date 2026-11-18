"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  studioLessonNudgeHref,
  type StudioLessonNudge,
} from "@/lib/studio-lesson-nudge";

export function PostTaskLessonNudge({
  nudge,
  onDismiss,
}: {
  nudge: StudioLessonNudge;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Related lessons"
      className="mt-4 rounded-2xl border border-border bg-background p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <BookOpen aria-hidden className="size-4 shrink-0 text-accent" />
        Keep learning
      </p>
      <p className="mt-2 text-sm text-muted" role="status">
        Explore related {nudge.category.replaceAll("_", " ")} lessons in the
        Studio.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={studioLessonNudgeHref(nudge)} onClick={onDismiss}>
            Open lessons
          </Link>
        </Button>
        <Button onClick={onDismiss} size="sm" variant="ghost" type="button">
          Dismiss
        </Button>
      </div>
    </section>
  );
}
