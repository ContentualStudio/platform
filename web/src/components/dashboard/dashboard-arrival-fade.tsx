"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function DashboardArrivalFade() {
  const [visible, setVisible] = React.useState(true);
  const [mounted, setMounted] = React.useState(true);

  React.useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() => setVisible(false));
    const removeTimer = window.setTimeout(
      () => setMounted(false),
      reducedMotion ? 50 : 800,
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-[100] bg-black transition-opacity duration-700 ease-out motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
