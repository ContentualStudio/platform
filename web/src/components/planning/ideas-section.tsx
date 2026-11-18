"use client";

import * as React from "react";
import { Lightbulb, X } from "lucide-react";
import {
  formatShortDate,
  IDEA_SORT_PLATFORMS,
  type ContentIdea,
} from "@/components/planning/data";
import { IdeaEditor } from "@/components/planning/idea-editor";
import { PlanningButton } from "@/components/planning/planning-button";
import {
  PlanningEmptyState,
  PlanningPill,
  PlanningSearchField,
} from "@/components/planning/planning-controls";
import { PlanningModal } from "@/components/planning/planning-modal";
import { PlanningSection } from "@/components/planning/planning-section";
import { useContentIdeas } from "@/components/planning/use-content-ideas";

type PlatformFilter = "date" | (typeof IDEA_SORT_PLATFORMS)[number];

function matchesQuery(idea: ContentIdea, query: string) {
  return [idea.title, idea.platform, idea.contentType, idea.notes].some(
    (field) => field.toLowerCase().includes(query),
  );
}

function IdeasGridSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="h-[168px] animate-pulse rounded-lg bg-background"
          key={index}
        />
      ))}
    </div>
  );
}

interface IdeaCardProps {
  idea: ContentIdea;
  onDelete: (idea: ContentIdea) => void;
  onEdit: (idea: ContentIdea) => void;
}

function IdeaCard({ idea, onDelete, onEdit }: IdeaCardProps) {
  return (
    <article className="flex flex-col gap-2 rounded-lg bg-background p-4 transition-shadow duration-200 ease-contentual hover:shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {idea.platform || "No platform"}
      </p>
      <h3 className="text-sm font-semibold leading-normal text-foreground">
        {idea.title || "Untitled"}
      </h3>
      <span className="self-start rounded bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
        {idea.contentType || "-"}
      </span>
      {idea.notes ? (
        <p className="line-clamp-3 text-sm leading-loose text-foreground/80">
          {idea.notes}
        </p>
      ) : null}
      <footer className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {formatShortDate(idea.createdAt)}
        </span>
        <div className="flex items-center gap-1">
          <PlanningButton onClick={() => onEdit(idea)}>Edit</PlanningButton>
          <button
            aria-label={`Delete ${idea.title}`}
            className="flex size-7 items-center justify-center rounded text-muted transition-colors duration-200 ease-contentual hover:bg-error/10 hover:text-error"
            onClick={() => onDelete(idea)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      </footer>
    </article>
  );
}

export function IdeasSection() {
  const { createIdea, deleteIdea, ideas, updateIdea } = useContentIdeas();
  const [query, setQuery] = React.useState("");
  const [platformFilter, setPlatformFilter] =
    React.useState<PlatformFilter>("date");
  const [editorState, setEditorState] = React.useState<
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; id: string }
  >({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = React.useState<ContentIdea | null>(
    null,
  );

  const normalisedQuery = query.trim().toLowerCase();

  const visible = (ideas ?? [])
    .filter((idea) => {
      if (platformFilter !== "date" && idea.platform !== platformFilter) {
        return false;
      }

      return !normalisedQuery || matchesQuery(idea, normalisedQuery);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const editing =
    editorState.mode === "edit"
      ? ideas?.find((idea) => idea.id === editorState.id)
      : undefined;

  function closeEditor() {
    setEditorState({ mode: "closed" });
  }

  return (
    <PlanningSection
      action={
        <PlanningButton
          onClick={() => setEditorState({ mode: "create" })}
          variant="primary"
        >
          + New idea
        </PlanningButton>
      }
      description="Jot down content ideas as they come to you. Save, search, sort, and manage notes across platforms."
      title="Content ideas"
    >
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <PlanningSearchField
          label="Search ideas"
          onChange={setQuery}
          placeholder="Search ideas..."
          value={query}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-muted">Sort by</span>
          <PlanningPill
            active={platformFilter === "date"}
            onClick={() => setPlatformFilter("date")}
          >
            Date
          </PlanningPill>
          {IDEA_SORT_PLATFORMS.map((platform) => (
            <PlanningPill
              active={platformFilter === platform}
              key={platform}
              onClick={() => setPlatformFilter(platform)}
            >
              {platform}
            </PlanningPill>
          ))}
        </div>
      </div>

      {ideas === null ? (
        <IdeasGridSkeleton />
      ) : ideas.length === 0 ? (
        <PlanningEmptyState
          description="Capture a thought the moment it lands - a hook, a format, a topic. Ideas you save show up here."
          icon={<Lightbulb className="size-6" />}
          title="No ideas yet"
        />
      ) : visible.length === 0 ? (
        <PlanningEmptyState
          compact
          description="Try a different search term or platform filter."
          title="No matching ideas"
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {visible.map((idea) => (
            <IdeaCard
              idea={idea}
              key={idea.id}
              onDelete={setPendingDelete}
              onEdit={(selected) =>
                setEditorState({ id: selected.id, mode: "edit" })
              }
            />
          ))}
        </div>
      )}

      {editorState.mode !== "closed" ? (
        <IdeaEditor
          idea={editing}
          onClose={closeEditor}
          onSubmit={(draft) => {
            if (editing) {
              updateIdea(editing.id, draft);
            } else {
              createIdea(draft);
            }

            setQuery("");
            closeEditor();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <PlanningModal
          className="w-[360px]"
          labelledBy="idea-delete-title"
          onClose={() => setPendingDelete(null)}
        >
          <p
            className="m-0 mb-5 text-base text-foreground"
            id="idea-delete-title"
          >
            Delete &ldquo;<strong>{pendingDelete.title}</strong>&rdquo;? This
            cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <PlanningButton onClick={() => setPendingDelete(null)}>
              Cancel
            </PlanningButton>
            <PlanningButton
              onClick={() => {
                deleteIdea(pendingDelete.id);
                setPendingDelete(null);
              }}
              variant="danger"
            >
              Delete
            </PlanningButton>
          </div>
        </PlanningModal>
      ) : null}
    </PlanningSection>
  );
}
