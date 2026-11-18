"use client";

import * as React from "react";
import { SEED_IDEAS, type ContentIdea } from "@/components/planning/data";

const IDEAS_STORAGE_KEY = "cee-sticky-notes";

function readIdeas(): ContentIdea[] {
  try {
    const stored = localStorage.getItem(IDEAS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as ContentIdea[];
    }
  } catch {
    // Corrupt or unavailable storage falls back to the seed set.
  }

  return SEED_IDEAS;
}

export type IdeaDraft = Pick<
  ContentIdea,
  "title" | "platform" | "contentType" | "notes"
>;

/**
 * Ideas are user-authored and have no api yet, so they live in localStorage.
 * Reading happens after mount to keep the server and client markup identical.
 */
export function useContentIdeas() {
  const [ideas, setIdeas] = React.useState<ContentIdea[] | null>(null);

  React.useEffect(() => {
    setIdeas(readIdeas());
  }, []);

  const persist = React.useCallback((next: ContentIdea[]) => {
    setIdeas(next);

    try {
      localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the in-memory list usable even when storage is unavailable.
    }
  }, []);

  const createIdea = React.useCallback(
    (draft: IdeaDraft) => {
      persist([
        { ...draft, createdAt: new Date().toISOString(), id: `sn-${Date.now()}` },
        ...(ideas ?? []),
      ]);
    },
    [ideas, persist],
  );

  const updateIdea = React.useCallback(
    (id: string, draft: IdeaDraft) => {
      persist(
        (ideas ?? []).map((idea) =>
          idea.id === id
            ? { ...idea, ...draft, updatedAt: new Date().toISOString() }
            : idea,
        ),
      );
    },
    [ideas, persist],
  );

  const deleteIdea = React.useCallback(
    (id: string) => {
      persist((ideas ?? []).filter((idea) => idea.id !== id));
    },
    [ideas, persist],
  );

  return { createIdea, deleteIdea, ideas, updateIdea };
}
