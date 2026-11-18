"use client";

import * as React from "react";
import Image from "next/image";
import type { AnimationItem } from "lottie-web";
import { cn } from "@/lib/utils";

const BALL_FRACTION = 0.346;

type CeeExpression = "idle" | "looking" | "yes" | "idea";

// One-shots play once and hold their last frame; the rest loop.
const ONE_SHOT: ReadonlySet<CeeExpression> = new Set(["yes", "idea"]);

// "idea" (the lightbulb) is specified but its Lottie has not been delivered
// yet. Until /brand/cee/cee_idea.json exists, a failed load falls back to the
// "yes" nod so the moment still reads as a result.
const FALLBACK: Partial<Record<CeeExpression, CeeExpression>> = {
  idea: "yes",
};

interface CeeMascotProps {
  className?: string;
  expression?: CeeExpression;
  size?: number;
}

/**
 * Animated Cee mascot. The static brand image remains visible while Lottie is
 * loading and is the permanent fallback for reduced-motion users.
 */
export function CeeMascot({
  className,
  expression = "looking",
  size = 148,
}: CeeMascotProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (
      !host ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let animation: AnimationItem | null = null;
    let cancelled = false;

    void import("lottie-web").then(({ default: lottie }) => {
      if (cancelled) {
        return;
      }

      const load = (name: CeeExpression) => {
        animation?.destroy();
        animation = lottie.loadAnimation({
          autoplay: true,
          container: host,
          loop: !ONE_SHOT.has(name),
          path: `/brand/cee/cee_${name}.json`,
          renderer: "svg",
        });
        animation.addEventListener("DOMLoaded", () => setIsReady(true));
        animation.addEventListener("data_failed", () => {
          const fallback = FALLBACK[name];
          if (fallback && !cancelled) {
            load(fallback);
          }
        });
      };

      load(expression);
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [expression]);

  const compositionSize = size / BALL_FRACTION;
  const compositionOffset = -(compositionSize - size) / 2;

  return (
    <div
      aria-label="Cee"
      className={cn("relative shrink-0", className)}
      role="img"
      style={{ height: size, width: size }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-[12%] z-0 rounded-full bg-accent/20 blur-2xl motion-safe:animate-pulse"
      />
      <Image
        alt=""
        aria-hidden="true"
        className={cn(
          "absolute inset-0 z-1 size-full transition-opacity duration-300",
          isReady ? "opacity-0" : "opacity-100",
        )}
        height={size}
        priority
        src="/brand/onboarding-character.png"
        width={size}
      />
      <div
        aria-hidden="true"
        className="absolute z-2 overflow-visible"
        ref={hostRef}
        style={{
          height: compositionSize,
          left: compositionOffset,
          top: compositionOffset,
          width: compositionSize,
        }}
      />
    </div>
  );
}
