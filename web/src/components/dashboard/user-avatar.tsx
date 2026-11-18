"use client";

import * as React from "react";
import { UserRound } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  className?: string;
  fallback?: "icon" | "initials";
  image?: string | null;
  name: string;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "C";
}

export function UserAvatar({
  className,
  fallback = "initials",
  image,
  name,
}: UserAvatarProps) {
  const initials = initialsFromName(name);
  const [failedImage, setFailedImage] = React.useState<string | null>(null);
  const showImage = Boolean(image && failedImage !== image);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground text-lg font-bold text-background",
        className,
      )}
    >
      {fallback === "icon" ? <UserRound className="size-7" /> : initials}
      {showImage && image ? (
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={44}
          onError={() => setFailedImage(image)}
          referrerPolicy="no-referrer"
          src={image}
          unoptimized
          width={44}
        />
      ) : null}
    </span>
  );
}
