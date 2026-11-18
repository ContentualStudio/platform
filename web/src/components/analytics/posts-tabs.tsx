"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabDef {
  value: string;
  label: string;
}

/**
 * WAI-ARIA tablist with roving tabindex and Left/Right/Home/End keyboard
 * support. Purely presentational — panels are rendered by the parent.
 */
export function PostsTabs({
  tabs,
  value,
  onValueChange,
  idBase,
}: {
  tabs: TabDef[];
  value: string;
  onValueChange: (next: string) => void;
  idBase: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const lastIndex = tabs.length - 1;
    let next = index;

    if (event.key === "ArrowRight") {
      next = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      next = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    onValueChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      aria-label="Posts"
      className="mb-6 flex gap-8 border-b-2 border-border"
      role="tablist"
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;

        return (
          <button
            aria-controls={`${idBase}-panel-${tab.value}`}
            aria-selected={active}
            className={cn(
              "relative -mb-0.5 pb-3.5 pt-2.5 text-base font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:bg-accent"
                : "text-muted hover:text-foreground",
            )}
            id={`${idBase}-tab-${tab.value}`}
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
