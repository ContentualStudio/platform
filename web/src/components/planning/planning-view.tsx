"use client";

import * as React from "react";
import { ContentCompass } from "@/components/planning/compass/content-compass";
import { IdeasSection } from "@/components/planning/ideas-section";
import { NotesSection } from "@/components/planning/notes-section";
import { OutputsSection } from "@/components/planning/outputs-section";
import {
  PlanningToast,
  usePlanningToast,
} from "@/components/planning/planning-toast";
import { cn } from "@/lib/utils";

type PlanningTab = "compass" | "ideas";

const TABS: { id: PlanningTab; label: string }[] = [
  { id: "compass", label: "Content Compass" },
  { id: "ideas", label: "Ideas & Notes" },
];

export function PlanningView() {
  const { dismissToast, showToast, toast } = usePlanningToast();
  const [tab, setTab] = React.useState<PlanningTab>("compass");

  return (
    <div className="flex w-full flex-col gap-5.5">
      <div
        aria-label="Planning sections"
        className="flex w-max max-w-full gap-1 rounded-full bg-surface p-1"
        role="tablist"
      >
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={cn(
              "rounded-full px-4.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
              tab === item.id &&
                "bg-background font-semibold text-foreground shadow-soft",
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "compass" ? (
        <ContentCompass />
      ) : (
        <div className="flex flex-col gap-8">
          <OutputsSection onNotify={showToast} />
          <NotesSection />
          <IdeasSection />
        </div>
      )}
      <PlanningToast onDismiss={dismissToast} toast={toast} />
    </div>
  );
}
