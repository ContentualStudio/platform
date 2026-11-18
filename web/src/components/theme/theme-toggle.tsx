"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

const OPTIONS: Record<
  ThemePreference,
  { icon: typeof Sun; label: string }
> = {
  dark: { icon: Moon, label: "Dark" },
  light: { icon: Sun, label: "Light" },
  system: { icon: Monitor, label: "System" },
};

/**
 * Segmented light / system / dark control. Selection takes effect immediately
 * via the theme provider (no reload) and is persisted.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1",
        className,
      )}
      role="radiogroup"
    >
      {THEME_PREFERENCES.map((value) => {
        const { icon: Icon, label } = OPTIONS[value];
        const selected = preference === value;

        return (
          <button
            aria-checked={selected}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground",
            )}
            key={value}
            onClick={() => setPreference(value)}
            role="radio"
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
