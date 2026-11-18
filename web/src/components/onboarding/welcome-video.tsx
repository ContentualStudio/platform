"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { CeeMascot } from "@/components/brand/cee-mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIMEO_ORIGIN = "https://player.vimeo.com";
const WELCOME_VIMEO_ID = "1235813045";

export function WelcomeVideo({
  name,
  onContinue,
}: {
  name: string;
  onContinue: () => void;
}) {
  const [ceeVisible, setCeeVisible] = React.useState(false);
  const [ceeCelebrating, setCeeCelebrating] = React.useState(false);
  const [messageVisible, setMessageVisible] = React.useState(false);
  const [videoVisible, setVideoVisible] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const playerRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() => setCeeVisible(true));
    const celebrateTimer = window.setTimeout(
      () => setCeeCelebrating(true),
      reducedMotion ? 0 : 650,
    );
    const messageTimer = window.setTimeout(
      () => setMessageVisible(true),
      reducedMotion ? 100 : 1_150,
    );
    const videoTimer = window.setTimeout(
      () => setVideoVisible(true),
      reducedMotion ? 1_400 : 4_000,
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(celebrateTimer);
      window.clearTimeout(messageTimer);
      window.clearTimeout(videoTimer);
    };
  }, []);

  function handleContinue() {
    if (leaving) {
      return;
    }
    setLeaving(true);
    // The player lives on Vimeo's origin, so it is paused through its
    // postMessage API rather than a media element.
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ method: "pause" }),
      VIMEO_ORIGIN,
    );
    window.setTimeout(onContinue, 450);
  }

  return (
    <main
      aria-label="Welcome to Contentual"
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh overflow-hidden bg-immersive-bg/72 backdrop-blur-[10px] transition-opacity duration-[450ms] ease-out motion-reduce:transition-none",
        leaving && "opacity-0",
      )}
      role="dialog"
    >
      <section
        aria-hidden={videoVisible || undefined}
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-6 text-center transition-[opacity,transform] duration-700 ease-in-out motion-reduce:transition-none",
          videoVisible
            ? "pointer-events-none scale-[0.97] opacity-0"
            : "scale-100 opacity-100",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--ds-accent-glow)_0%,transparent_68%)] opacity-75"
        />
        <div
          className={cn(
            "relative z-1 translate-y-5 scale-[0.58] opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
            ceeVisible && "translate-y-0 scale-100 opacity-100",
          )}
        >
          <div className={cn(ceeCelebrating && "onboarding-cee-hop")}>
            <CeeMascot
              expression={ceeCelebrating ? "yes" : "idle"}
              size={176}
            />
          </div>
        </div>

        <div
          aria-live="polite"
          className={cn(
            "relative z-1 mt-10 w-full max-w-160 translate-y-4 opacity-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
            messageVisible && "translate-y-0 opacity-100",
          )}
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-5.5 block h-1 w-12 rounded-full bg-accent"
          />
          <h1 className="text-[clamp(1.875rem,3.6vw,2.875rem)] font-extrabold leading-snug tracking-tighter text-immersive-fg">
            Thank You{name ? `, ${name}` : ""}!
          </h1>
          <p className="mt-3.5 text-[clamp(1rem,1.6vw,1.1875rem)] font-medium leading-normal text-immersive-fg/72">
            Let&apos;s get your journey started. Welcome to Contentual.
          </p>
        </div>
      </section>

      <section
        aria-hidden={!videoVisible || leaving}
        className={cn(
          "absolute inset-0 flex items-center justify-center px-4 py-8 opacity-0 transition-opacity ease-in-out motion-reduce:transition-none sm:px-8",
          leaving ? "duration-[450ms]" : "duration-[800ms]",
          videoVisible && !leaving
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none",
        )}
        inert={!videoVisible || leaving || undefined}
      >
        <div
          className={cn(
            "w-full max-w-245 translate-y-4 scale-[0.985] overflow-hidden rounded-2xl bg-background text-foreground opacity-0 shadow-[0_30px_90px_rgba(0,0,0,0.35)] transition-[opacity,transform] delay-200 duration-[600ms] ease-out motion-reduce:transition-none",
            videoVisible && "translate-y-0 scale-100 opacity-100",
          )}
        >
          <div className="relative aspect-video w-full bg-black">
            {/* Mounted only once the card shows, so the player loads when it
                is about to be watched rather than behind the thank-you. */}
            {videoVisible ? (
              <iframe
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                // oxlint-disable-next-line iframe-missing-sandbox
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 size-full"
                ref={playerRef}
                src={`${VIMEO_ORIGIN}/video/${WELCOME_VIMEO_ID}?title=0&byline=0&portrait=0`}
                tabIndex={leaving ? -1 : 0}
                title="Welcome to Contentual"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                Welcome to Contentual
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                A quick introduction before you begin{name ? `, ${name}` : ""}.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                className="rounded-full border border-border px-5 py-2.75 text-sm font-bold text-foreground transition-colors hover:bg-control-hover"
                disabled={leaving || !videoVisible}
                onClick={handleContinue}
                type="button"
              >
                Skip
              </button>
              <Button
                disabled={leaving || !videoVisible}
                onClick={handleContinue}
                variant="accent"
              >
                Continue to dashboard
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
