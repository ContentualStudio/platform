"use client";

/* oxlint-disable react/iframe-missing-sandbox -- Vimeo runs cross-origin and requires both scripts and same-origin for playback. */

import * as React from "react";
import {
  safeContentUrl,
  vimeoPlayerUrl,
  type StudioLessonDetail,
} from "@/lib/studio-lesson";
import { renderArticleBody } from "./studio-article";
import { Button } from "@/components/ui/button";

export function LessonFailure({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="rounded-3xl bg-surface p-6 text-center">
      <p className="mb-4 text-foreground">{message}</p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}

function LessonVideo({
  lesson,
  retry,
}: {
  lesson: StudioLessonDetail;
  retry: () => void;
}) {
  const src = vimeoPlayerUrl(lesson.vimeoVideoId);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );
  React.useEffect(() => {
    const timer = window.setTimeout(() => setStatus("error"), 20000);
    function receive(event: MessageEvent) {
      if (
        event.origin !== "https://player.vimeo.com" ||
        event.source !== frame.current?.contentWindow
      )
        return;
      let data;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.event === "ready" || data?.method === "ping") {
        clearTimeout(timer);
        setStatus("ready");
        frame.current?.contentWindow?.postMessage(
          JSON.stringify({ method: "addEventListener", value: "error" }),
          event.origin,
        );
      }
      if (data?.event === "error") {
        clearTimeout(timer);
        setStatus("error");
      }
    }
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [attempt]);
  if (!src)
    return <LessonFailure message="This video is unavailable." retry={retry} />;
  return (
    <div>
      {status === "error" ? (
        <LessonFailure
          message="The video could not start. Check your connection and try again."
          retry={() => {
            setStatus("loading");
            setAttempt(attempt + 1);
          }}
        />
      ) : null}
      {status === "loading" ? (
        <p role="status" className="mb-3 text-sm text-muted">
          Loading video…
        </p>
      ) : null}
      {/* Vimeo is a cross-origin player and needs scripts and its origin for playback. */}
      <iframe
        key={attempt}
        ref={frame}
        title={lesson.title}
        src={src}
        className={
          status === "error"
            ? "hidden"
            : "aspect-video w-full rounded-3xl bg-foreground"
        }
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            JSON.stringify({ method: "ping" }),
            "https://player.vimeo.com",
          )
        }
        onError={() => setStatus("error")}
      />
    </div>
  );
}

function LessonTemplate({
  lesson,
  retry,
}: {
  lesson: StudioLessonDetail;
  retry: () => void;
}) {
  const url = safeContentUrl(lesson.templateUrl);
  const [busy, setBusy] = React.useState(false);
  const [previewError, setPreviewError] = React.useState(false);
  const [error, setError] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);
  async function download() {
    if (!url || busy) return;
    setBusy(true);
    setError(false);
    controller.current = new AbortController();
    try {
      const response = await fetch(url, { signal: controller.current.signal });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (!blob.type.includes("pdf")) throw new Error("Invalid PDF");
      const local = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = local;
      anchor.download = `${lesson.slug}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(local), 1000);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!url)
    return (
      <LessonFailure
        message="This template is unavailable. Try loading the lesson again."
        retry={retry}
      />
    );
  return (
    <div className="grid items-center gap-7 rounded-3xl bg-surface p-6 md:grid-cols-2">
      <div>
        {previewError ? (
          <LessonFailure
            message="The preview could not load. Try loading the lesson again."
            retry={retry}
          />
        ) : null}
        <object
          onError={() => setPreviewError(true)}
          data={url}
          type="application/pdf"
          aria-label="PDF template preview"
          className="aspect-4/5 w-full rounded-lg bg-background"
        >
          <p className="p-4 text-sm text-muted">
            Your browser cannot display this PDF. Download it to view the
            template.
          </p>
        </object>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-accent">PDF template</p>
        <h3 className="mt-2 text-2xl">
          Ready to use in your next planning session
        </h3>
        <p className="my-4 text-muted">{lesson.summary}</p>
        <Button disabled={busy} onClick={download}>
          {busy ? "Downloading…" : "Download PDF"}
        </Button>
        {error ? (
          <div className="mt-4">
            <LessonFailure
              message="The PDF could not download. Check your connection and try again."
              retry={download}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LessonContent({
  lesson,
  retry,
}: {
  lesson: StudioLessonDetail;
  retry: () => void;
}) {
  if (lesson.lessonType === "template")
    return <LessonTemplate lesson={lesson} retry={retry} />;
  if (lesson.lessonType !== "article")
    return <LessonVideo lesson={lesson} retry={retry} />;
  return (
    renderArticleBody(lesson.body) ?? (
      <LessonFailure message="This article could not load." retry={retry} />
    )
  );
}
