import * as React from "react";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    decorative?: boolean;
    orientation?: "horizontal" | "vertical";
  }
>(
  (
    { className, decorative = true, orientation = "horizontal", ...props },
    ref,
  ) => (
    <div
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      ref={ref}
      role={decorative ? "none" : "separator"}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export { Separator };
