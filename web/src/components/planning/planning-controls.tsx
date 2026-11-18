"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchFieldProps {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export function PlanningSearchField({
  className,
  label,
  onChange,
  placeholder,
  value,
}: SearchFieldProps) {
  return (
    <div className={cn("relative min-w-[200px] max-w-[320px] flex-1", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        aria-label={label}
        className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3.5 text-sm text-foreground outline-none transition-colors duration-200 ease-contentual placeholder:text-muted focus:border-foreground"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  value: T;
}

export function PlanningSelect<T extends string>({
  label,
  onChange,
  options,
  value,
}: SelectProps<T>) {
  return (
    <select
      aria-label={label}
      className="cursor-pointer rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors duration-200 ease-contentual focus:border-foreground"
      onChange={(event) => onChange(event.target.value as T)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function PlanningPill({ active, className, ...props }: PillProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 ease-contentual",
        active
          ? "border-foreground text-foreground"
          : "border-border text-muted hover:border-foreground hover:text-foreground",
        className,
      )}
      type="button"
      {...props}
    />
  );
}

interface EmptyStateProps {
  compact?: boolean;
  description: string;
  icon?: React.ReactNode;
  title: string;
}

export function PlanningEmptyState({
  compact = false,
  description,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <div className={cn("px-6 text-center", compact ? "py-8" : "py-12")}>
      {icon ? (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-3xl border border-border bg-background text-muted">
          {icon}
        </div>
      ) : null}
      <p className="mb-1 text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto max-w-[340px] text-sm leading-loose text-muted">
        {description}
      </p>
    </div>
  );
}
