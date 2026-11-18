import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={cn("relative inline-block size-12", className)}>
      <Image
        alt="Contentual"
        fill
        priority
        sizes="48px"
        src="/brand/contentual-favicon.png"
      />
    </span>
  );
}
