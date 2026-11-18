import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Glyphs are the Phosphor regular strokes from the design export (256 viewBox,
// stroke 16). Active items bump the stroke to 17, matching `.nav-item.active`.

interface NavIconProps {
  active?: boolean;
  className?: string;
}

function NavGlyph({
  active = false,
  children,
  className,
}: NavIconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 17 : 16}
      viewBox="0 0 256 256"
    >
      {children}
    </svg>
  );
}

export function HomeNavIcon(props: NavIconProps) {
  return (
    <NavGlyph {...props}>
      <line x1="16" x2="240" y1="216" y2="216" />
      <polyline points="152 216 152 152 104 152 104 216" />
      <line x1="40" x2="40" y1="116.69" y2="216" />
      <line x1="216" x2="216" y1="216" y2="116.69" />
      <path d="M24,132.69l98.34-98.35a8,8,0,0,1,11.32,0L232,132.69" />
    </NavGlyph>
  );
}

export function ProgramsNavIcon(props: NavIconProps) {
  return (
    <NavGlyph {...props}>
      <polyline points="152 224 232 56 40 56 88 104 40 152 186.29 152" />
    </NavGlyph>
  );
}

export function AnalyticsNavIcon(props: NavIconProps) {
  return (
    <NavGlyph {...props}>
      <polyline points="224 208 32 208 32 48" />
      <polyline points="224 96 160 152 96 104 32 160" />
    </NavGlyph>
  );
}

export function PlanningNavIcon(props: NavIconProps) {
  return (
    <NavGlyph {...props}>
      <path d="M200,224H56a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h96l56,56V216A8,8,0,0,1,200,224Z" />
      <polyline points="148 32 148 92 208 92" />
      <line x1="104" x2="152" y1="152" y2="152" />
    </NavGlyph>
  );
}

export function StudioNavIcon(props: NavIconProps) {
  return (
    <NavGlyph {...props}>
      <rect
        height="140"
        rx="16"
        transform="translate(256 236) rotate(180)"
        width="192"
        x="32"
        y="48"
      />
      <line x1="160" x2="96" y1="224" y2="224" />
      <line x1="32" x2="224" y1="148" y2="148" />
      <line x1="128" x2="128" y1="192" y2="224" />
    </NavGlyph>
  );
}
