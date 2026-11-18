"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { adminUsersHref } from "@/lib/admin/admin-users-search";

const DEBOUNCE_MS = 300;

/**
 * The search box writes to the URL, not to local state: the term then
 * survives paging, a retry, and coming back from a user's page, and the
 * server render is the single source of what is listed. A new term always
 * resets to page one.
 */
export function AdminUserSearch() {
  const router = useRouter();
  const urlQuery = useSearchParams().get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Back/forward can change the URL under us; follow it. Adjusting state
  // during render (rather than in an effect) avoids a flash of the old term.
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    const next = value.trim();

    if (next === urlQuery) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(adminUsersHref({ q: next }), { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [value, urlQuery, router]);

  // "/" jumps to search from anywhere on the page, as in most admin tools.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative w-full max-w-md">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search users by name or email"
        autoComplete="off"
        className="h-9 rounded-md border-transparent bg-control pr-16 pl-9 text-sm focus:bg-background [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            setValue("");
          }
        }}
        placeholder="Search by name or email"
        ref={inputRef}
        spellCheck={false}
        type="search"
        value={value}
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {isPending ? (
          <span role="status">
            <Spinner className="size-4 text-muted-foreground" />
            <span className="sr-only">Searching</span>
          </span>
        ) : null}
        {value ? (
          <button
            aria-label="Clear search"
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-control hover:text-foreground"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden h-6 items-center rounded-xs border border-border px-2 font-sans text-2xs font-semibold text-muted-foreground sm:flex">
            /
          </kbd>
        )}
      </div>
    </div>
  );
}

export function AdminUserSearchSkeleton() {
  return (
    <div aria-hidden className="h-9 w-full max-w-md rounded-md bg-control" data-skeleton />
  );
}
