"use client";

import * as React from "react";
import {
  Bold,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import { PlanningButton } from "@/components/planning/planning-button";
import { PlanningModal } from "@/components/planning/planning-modal";
import { PlanningSection } from "@/components/planning/planning-section";
import { cn } from "@/lib/utils";

const NOTES_STORAGE_KEY = "cee-notes-draft";

type SaveState = "ready" | "unsaved" | "saved";

const SAVE_LABELS: Record<SaveState, string> = {
  ready: "Ready",
  saved: "Saved",
  unsaved: "Unsaved",
};

function countWords(text: string) {
  const trimmed = text.trim();

  return trimmed ? trimmed.split(/\s+/).length : 0;
}

interface ToolbarButtonProps {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ToolbarButton({ children, label, onClick }: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-contentual hover:bg-surface hover:text-foreground"
      // Keep the editor selection alive: mousedown would blur it first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <span aria-hidden className="mx-0.5 h-4.5 w-px bg-border" />;
}

export function NotesSection() {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("ready");
  const [wordCount, setWordCount] = React.useState(0);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const savedSelection = React.useRef<Range | null>(null);

  // The editor is uncontrolled — React must not own contenteditable markup —
  // so the stored draft is written in once, after hydration.
  React.useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    let draft = "";

    try {
      draft = localStorage.getItem(NOTES_STORAGE_KEY) ?? "";
    } catch {
      draft = "";
    }

    editor.innerHTML = draft;
    setWordCount(countWords(editor.innerText));
  }, []);

  const save = React.useCallback(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    try {
      localStorage.setItem(NOTES_STORAGE_KEY, editor.innerHTML);
    } catch {
      // A full or blocked storage quota shouldn't break typing.
    }

    setSaveState("saved");
  }, []);

  // Reset the "Saved" flash back to idle unless the user typed again.
  React.useEffect(() => {
    if (saveState !== "saved") {
      return;
    }

    const timer = setTimeout(() => setSaveState("ready"), 2500);

    return () => clearTimeout(timer);
  }, [saveState]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        save();
      }
    }

    const editor = editorRef.current;
    editor?.addEventListener("keydown", onKeyDown);

    return () => editor?.removeEventListener("keydown", onKeyDown);
  }, [save]);

  function handleInput() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setWordCount(countWords(editor.innerText));
    setSaveState("unsaved");
  }

  /**
   * `execCommand` is deprecated but remains the only cross-browser way to apply
   * inline formatting to a contenteditable without shipping an editor engine.
   * Swap this for a real rich-text model if notes gain collaborative editing.
   */
  function format(command: string, value?: string) {
    editorRef.current?.focus();
    // oxlint-disable-next-line no-deprecated-api -- see comment above
    document.execCommand(command, false, value);
    handleInput();
  }

  function openLinkPrompt() {
    const selection = window.getSelection();
    savedSelection.current =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).cloneRange()
        : null;
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);

    if (!url) {
      return;
    }

    const range = savedSelection.current;

    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    format("createLink", url);
  }

  return (
    <PlanningSection
      action={
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full transition-colors duration-200 ease-contentual",
              saveState === "saved" ? "bg-success" : "bg-muted",
              saveState === "unsaved" &&
                "animate-[planning-pulse_0.8s_ease-in-out_infinite]",
            )}
          />
          <span
            aria-live="polite"
            className={cn(
              "text-xs font-semibold",
              saveState === "saved" ? "text-success" : "text-muted",
            )}
          >
            {SAVE_LABELS[saveState]}
          </span>
        </div>
      }
      description="Write captions, scripts, or any notes for your content. Drafts are saved here."
      title="Post-drafting notes"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1">
          <ToolbarButton label="Bold" onClick={() => format("bold")}>
            <Bold className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => format("italic")}>
            <Italic className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Underline" onClick={() => format("underline")}>
            <Underline className="size-3.5" />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton
            label="Bulleted list"
            onClick={() => format("insertUnorderedList")}
          >
            <List className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            onClick={() => format("insertOrderedList")}
          >
            <ListOrdered className="size-3.5" />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton
            label="Heading"
            onClick={() => format("formatBlock", "<h2>")}
          >
            <Heading className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Insert link" onClick={openLinkPrompt}>
            <Link2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarSeparator />
          <span className="whitespace-nowrap px-1 text-xs font-semibold text-muted">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
        </div>
        {saveState === "unsaved" ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4.5 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity duration-200 ease-contentual hover:opacity-90"
            onClick={save}
            type="button"
          >
            Save
          </button>
        ) : null}
      </div>

      <div
        aria-label="Post-drafting notes"
        aria-multiline="true"
        className="planning-editor min-h-[220px] rounded-lg border border-border bg-background p-5 text-base leading-airy text-foreground outline-none transition-[border-color,box-shadow] duration-200 ease-contentual focus:border-foreground focus:shadow-focus-accent"
        contentEditable
        data-placeholder="Start writing your captions, scripts, or content ideas..."
        onInput={handleInput}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />

      {linkOpen ? (
        <PlanningModal
          className="w-[400px]"
          labelledBy="planning-link-title"
          onClose={() => setLinkOpen(false)}
        >
          <h3
            className="m-0 text-lg font-semibold text-foreground"
            id="planning-link-title"
          >
            Insert link
          </h3>
          <div className="flex flex-col gap-1">
            <label
              className="text-sm font-semibold text-muted"
              htmlFor="planning-link-url"
            >
              URL
            </label>
            <input
              className="rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors duration-200 ease-contentual focus:border-foreground"
              id="planning-link-url"
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyLink();
                }
              }}
              placeholder="https://example.com"
              type="url"
              value={linkUrl}
            />
          </div>
          <div className="flex justify-end gap-3">
            <PlanningButton onClick={() => setLinkOpen(false)}>
              Cancel
            </PlanningButton>
            <PlanningButton onClick={applyLink} variant="primary">
              Insert
            </PlanningButton>
          </div>
        </PlanningModal>
      ) : null}
    </PlanningSection>
  );
}
