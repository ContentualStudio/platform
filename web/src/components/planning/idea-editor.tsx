"use client";

import * as React from "react";
import {
  IDEA_CONTENT_TYPES,
  IDEA_PLATFORMS,
  type ContentIdea,
} from "@/components/planning/data";
import { PlanningButton } from "@/components/planning/planning-button";
import { PlanningModal } from "@/components/planning/planning-modal";
import type { IdeaDraft } from "@/components/planning/use-content-ideas";

interface IdeaEditorProps {
  /** Absent when creating a new idea. */
  idea?: ContentIdea;
  onClose: () => void;
  onSubmit: (draft: IdeaDraft) => void;
}

const fieldClass =
  "rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors duration-200 ease-contentual focus:border-foreground";

const labelClass = "text-sm font-semibold text-muted";

export function IdeaEditor({ idea, onClose, onSubmit }: IdeaEditorProps) {
  const [title, setTitle] = React.useState(idea?.title ?? "");
  const [platform, setPlatform] = React.useState(idea?.platform ?? "");
  const [contentType, setContentType] = React.useState(idea?.contentType ?? "");
  const [notes, setNotes] = React.useState(idea?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();

    if (!trimmed) {
      setError("Give your idea a title so you can find it later.");
      return;
    }

    onSubmit({ contentType, notes: notes.trim(), platform, title: trimmed });
  }

  return (
    <PlanningModal labelledBy="idea-editor-title" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <h3
          className="m-0 text-lg font-semibold text-foreground"
          id="idea-editor-title"
        >
          {idea ? "Edit idea" : "New idea"}
        </h3>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="idea-title">
            Title
          </label>
          <input
            aria-describedby={error ? "idea-title-error" : undefined}
            aria-invalid={error ? true : undefined}
            className={fieldClass}
            id="idea-title"
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="Give your idea a name"
            type="text"
            value={title}
          />
          {error ? (
            <p className="text-sm text-error" id="idea-title-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="idea-platform">
            Platform
          </label>
          <select
            className={fieldClass}
            id="idea-platform"
            onChange={(event) => setPlatform(event.target.value)}
            value={platform}
          >
            <option value="">Select platform</option>
            {IDEA_PLATFORMS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="idea-type">
            Content type
          </label>
          <select
            className={fieldClass}
            id="idea-type"
            onChange={(event) => setContentType(event.target.value)}
            value={contentType}
          >
            <option value="">Select type</option>
            {IDEA_CONTENT_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="idea-notes">
            Notes
          </label>
          <textarea
            className={`${fieldClass} min-h-20 resize-y`}
            id="idea-notes"
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What's the idea?"
            value={notes}
          />
        </div>

        <div className="flex justify-end gap-3">
          <PlanningButton onClick={onClose}>Cancel</PlanningButton>
          <PlanningButton type="submit" variant="primary">
            {idea ? "Save" : "Create"}
          </PlanningButton>
        </div>
      </form>
    </PlanningModal>
  );
}
