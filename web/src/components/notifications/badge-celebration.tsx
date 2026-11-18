"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useInAppNotificationsContext } from "@/components/notifications/in-app-notifications-provider";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import {
  badgeArtworkSrc,
  mergePendingCelebrations,
  type BadgeCelebration,
} from "@/lib/badge-celebrations";
import { cn } from "@/lib/utils";
import {
  fetchPendingBadgeCelebrations,
  markBadgeCelebrationShown,
} from "@/services/badge-celebrations.service";

// The card's exit transition, before the next badge (or nothing) replaces it.
const EXIT_MS = 300;

// Confetti and fireworks have all finished by then; their nodes are removed.
const PARTICLES_MS = 3_000;

// Where the ✕ lands: the active programme overview.
const OVERVIEW_HREF = "/programs";

const PARTICLE_COLORS = [
  "var(--ds-accent)",
  "var(--ds-tint-amber)",
  "var(--ds-success)",
  "var(--ds-accent-on)",
  "var(--ds-accent-bright)",
];

// Deterministic scatter: the same on the server and in the browser, and pure,
// so every particle's style is computed once at module load.
function scatter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const CONFETTI = Array.from({ length: 26 }, (_piece, index) => ({
  left: `${Math.round(scatter(index, 1) * 100)}%`,
  background: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
  "--tx": `${Math.round((scatter(index, 2) * 2 - 1) * 160)}px`,
  "--rot": `${Math.round((scatter(index, 3) * 2 - 1) * 720)}deg`,
  animationDuration: `${(1.4 + scatter(index, 4) * 1.1).toFixed(2)}s`,
  animationDelay: `${(scatter(index, 5) * 0.5).toFixed(2)}s`,
})) as React.CSSProperties[];

const FIREWORKS = Array.from({ length: 6 }, (_burst, burst) => {
  const color = PARTICLE_COLORS[burst % PARTICLE_COLORS.length];
  const delay = `${(burst * 0.3 + scatter(burst, 8) * 0.25).toFixed(2)}s`;

  return {
    position: {
      left: `${(10 + scatter(burst, 6) * 80).toFixed(1)}%`,
      top: `${(10 + scatter(burst, 7) * 46).toFixed(1)}%`,
    },
    flash: { background: color, animationDelay: delay },
    sparks: Array.from({ length: 26 }, (_spark, spark) => {
      const seed = burst * 26 + spark;
      const angle = (spark / 26) * Math.PI * 2 + scatter(seed, 9) * 0.25;
      const distance = 60 + scatter(seed, 10) * 60;

      return {
        background: color,
        boxShadow: `0 0 10px 2px ${color}`,
        "--dx": `${Math.round(Math.cos(angle) * distance)}px`,
        "--dy": `${Math.round(Math.sin(angle) * distance)}px`,
        animationDuration: `${(0.9 + scatter(seed, 11) * 0.4).toFixed(2)}s`,
        animationDelay: delay,
      } as React.CSSProperties;
    }),
  };
});

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Presents released badges full-screen (design/index.html, "Badge
 * celebration"). Mounted once for every signed-in page.
 *
 * It reads the owed celebrations on load, so a badge released while the user
 * was away is shown when they return, and again whenever a new `badge_earned`
 * notification arrives. The head of the queue is on screen while the tab is
 * visible; each dismissal is recorded, so a badge is never celebrated twice.
 */
export function BadgeCelebrationHost() {
  const router = useRouter();
  const { items, activeNotification, completeActiveNotification } =
    useInAppNotificationsContext();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => false,
  );
  const [queue, setQueue] = React.useState<BadgeCelebration[]>([]);
  const dismissed = React.useRef(new Set<string>());

  // The newest badge_earned notification: a release is the signal to re-read.
  const releaseSignal =
    items.find((item) => item.type === "badge_earned")?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;

    fetchPendingBadgeCelebrations()
      .then((fetched) => {
        if (!cancelled) {
          setQueue((existing) =>
            mergePendingCelebrations(existing, fetched, dismissed.current),
          );
        }
      })
      // Owed celebrations are re-read on the next load or release.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [releaseSignal]);

  const current = visible ? (queue[0] ?? null) : null;

  // The takeover is the badge moment; its toast would say the same thing
  // underneath it. The notification itself stays in the inbox.
  React.useEffect(() => {
    if (current && activeNotification?.type === "badge_earned") {
      completeActiveNotification();
    }
  }, [activeNotification, completeActiveNotification, current]);

  if (!current) {
    return null;
  }

  return (
    <CelebrationDialog
      celebration={current}
      key={current.id}
      onDismissed={(href) => {
        dismissed.current.add(current.id);
        setQueue((existing) => existing.filter((item) => item.id !== current.id));
        if (href) {
          router.push(href);
        }
      }}
      onDismissing={() => {
        // Best effort: if this fails the badge is owed again on the next
        // load, which is better than losing it.
        void markBadgeCelebrationShown(current.id).catch(() => undefined);
      }}
    />
  );
}

function CelebrationDialog({
  celebration,
  onDismissing,
  onDismissed,
}: {
  celebration: BadgeCelebration;
  onDismissing: () => void;
  onDismissed: (href?: string) => void;
}) {
  const [entered, setEntered] = React.useState(false);
  const [particles, setParticles] = React.useState(true);
  const leaving = React.useRef(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const artwork = badgeArtworkSrc(celebration.key);

  React.useEffect(() => {
    // Enter on the frame after mount so the transition runs.
    const frame = requestAnimationFrame(() => setEntered(true));
    const cleanup = setTimeout(() => setParticles(false), PARTICLES_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(cleanup);
    };
  }, []);

  const dismiss = (href?: string) => {
    if (leaving.current) {
      return;
    }

    leaving.current = true;
    onDismissing();
    setEntered(false);
    setTimeout(() => onDismissed(href), EXIT_MS);
  };

  useModalDialog(cardRef, () => dismiss());

  return createPortal(
    <div className="fixed inset-0 z-300 flex items-center justify-center p-6">
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none",
          entered ? "opacity-100" : "opacity-0",
        )}
      />

      {entered && particles ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-1 overflow-hidden motion-reduce:hidden">
          {CONFETTI.map((style, index) => (
            <i
              className="absolute -top-4 h-3.5 w-2.25 animate-[badge-confetti-fall_ease-in_forwards] rounded-xs opacity-0"
              key={index}
              style={style}
            />
          ))}
          {FIREWORKS.map((burst, index) => (
            <span className="absolute size-0" key={index} style={burst.position}>
              <span
                className="absolute -left-1.25 -top-1.25 size-2.5 animate-[badge-flash_0.55s_ease-out_forwards] rounded-full opacity-0"
                style={burst.flash}
              />
              {burst.sparks.map((style, sparkIndex) => (
                <i
                  className="absolute -left-1 -top-1 size-2 animate-[badge-spark_ease-out_forwards] rounded-full opacity-0"
                  key={sparkIndex}
                  style={style}
                />
              ))}
            </span>
          ))}
        </div>
      ) : null}

      <div
        aria-labelledby="badge-celebration-title"
        aria-modal="true"
        className={cn(
          "relative z-2 w-full max-w-110 rounded-2xl bg-background px-8.5 pb-8.5 pt-11 text-center text-foreground shadow-lifted transition-[transform,opacity] duration-[450ms] ease-contentual motion-reduce:transition-none",
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0",
        )}
        ref={cardRef}
        role="dialog"
      >
        <div className="mx-auto mb-4.5 grid size-50 place-items-center">
          {artwork ? (
            <Image
              alt=""
              className={cn(
                "size-full object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.28)]",
                entered && "motion-safe:animate-[badge-pop_0.6s_cubic-bezier(0.2,0.9,0.3,1.4)_both]",
              )}
              height={200}
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
              src={artwork}
              width={200}
            />
          ) : null}
        </div>

        <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-accent">
          Badge unlocked
        </p>
        <h2
          className="mb-2.5 text-2xl font-extrabold tracking-tight"
          id="badge-celebration-title"
        >
          {celebration.name}
        </h2>
        {celebration.description ? (
          <p className="mx-auto mb-6.5 max-w-[34ch] text-base leading-body text-muted">
            {celebration.description}
          </p>
        ) : null}
        {/* First in the DOM so it takes focus on open, as in the design. */}
        <button
          className="min-h-12 rounded-full bg-foreground px-8.5 text-base font-bold text-background transition-[transform,opacity] hover:-translate-y-px hover:opacity-90"
          onClick={() => dismiss()}
          type="button"
        >
          Continue
        </button>

        <button
          aria-label="Close and open your programme overview"
          className="absolute right-3.5 top-3.5 grid size-10 place-items-center rounded-full bg-surface text-muted transition-colors hover:bg-control hover:text-foreground"
          onClick={() => dismiss(OVERVIEW_HREF)}
          type="button"
        >
          <X aria-hidden className="size-4.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
