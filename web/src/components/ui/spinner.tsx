import * as React from "react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[18px] animate-spin rounded-full border-2 border-current/30 border-t-current",
        className,
      )}
      {...props}
    />
  );
}
