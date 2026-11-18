"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  settingsSectionFromPathname,
  settingsSections,
  type SettingsSection,
} from "@/lib/settings";

export function SettingsSectionLabel({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h2
      className="mb-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted"
      id={id}
    >
      {children}
    </h2>
  );
}

export function SettingsRow({
  action,
  description,
  title,
  type,
}: {
  action: ReactNode;
  description: string;
  title: string;
  type?: "delete";
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-5 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm font-semibold",
            type === "delete" ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function SettingsStatusBadge({
  children,
  variant = "comingSoon",
}: {
  children: ReactNode;
  variant?: "connected" | "comingSoon";
}) {
  return (
    <span
      className={cn(
        "rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted",
        variant === "connected" && "bg-[#E8FFE8] text-[#34c759] dark:bg-[#1a3a1a] dark:text-[#77dc91]",
      )}
    >
      {children}
    </span>
  );
}

export function SettingsPrimaryButton({
  children,
  className,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-0 items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-accent dark:text-white",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function SettingsOutlineButton({
  children,
  className,
  disabled,
  destructive = false,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-0 items-center justify-center gap-2 rounded-full border border-border bg-transparent px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:border-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        destructive &&
          "border-destructive text-destructive hover:border-destructive hover:text-destructive",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function SettingsToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-xl border-0 bg-[#ddd] transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.15)] after:transition-transform dark:bg-control",
        checked && "bg-success after:translate-x-5",
        disabled && "cursor-not-allowed opacity-60",
      )}
      disabled={disabled}
      onClick={onChange}
      role="switch"
      type="button"
    />
  );
}

export function SettingsFieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      className="text-[13px] font-semibold text-foreground"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

export const settingsFieldClass =
  "h-11 w-full rounded-[10px] border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:border-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function PlatformBrandTile({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <span
      className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-background"
      title={title}
    >
      {children}
    </span>
  );
}

export function SettingsTabNav({
  section: sectionProp,
}: {
  section?: SettingsSection | null;
}) {
  const pathname = usePathname();
  const section = settingsSectionFromPathname(pathname) ?? sectionProp;

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 mb-6 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max border-b-2 border-border">
        {settingsSections.map((item, index) => {
          const active = section != null && item.slug === section;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap px-5 py-2.5 text-sm font-semibold text-muted transition-colors duration-150 hover:text-foreground focus-visible:z-10 focus-visible:text-foreground",
                index === 0 && "pl-0",
                active &&
                  "text-foreground after:absolute after:-bottom-0.5 after:left-5 after:right-5 after:h-0.5 after:bg-accent",
                index === 0 && active && "after:left-0",
              )}
              href={`/settings/${item.slug}`}
              key={item.slug}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
