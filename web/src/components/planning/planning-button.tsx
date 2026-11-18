import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The small pill button the Planning page uses inside cards and modals. The
 * shared `Button` is sized for page-level actions (min-height 48px), which is
 * too tall for a card footer.
 */
const planningButtonVariants = cva(
  "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ease-contentual focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        danger:
          "border-border bg-background text-foreground hover:border-error hover:text-error",
        default:
          "border-foreground bg-background text-foreground hover:bg-surface",
        primary:
          "border-foreground bg-foreground text-background hover:opacity-85",
      },
    },
  },
);

export type PlanningButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof planningButtonVariants>;

export function PlanningButton({
  className,
  variant,
  type = "button",
  ...props
}: PlanningButtonProps) {
  return (
    <button
      className={cn(planningButtonVariants({ className, variant }))}
      type={type}
      {...props}
    />
  );
}
