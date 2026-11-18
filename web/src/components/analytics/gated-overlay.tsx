import { Lock } from "lucide-react";

/**
 * Wraps plan-restricted content: blurs and disables it, overlaying an upgrade
 * affordance. In a real build the restricted data would be withheld
 * server-side; this only handles the visual gate.
 */
export function GatedOverlay({
  label = "Upgrade to unlock",
  onUpgrade,
  children,
}: {
  label?: string;
  onUpgrade?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none blur-[6px]"
        inert
      >
        {children}
      </div>
      <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={onUpgrade}
          type="button"
        >
          <Lock className="size-3.5" />
          {label}
        </button>
      </div>
    </div>
  );
}
