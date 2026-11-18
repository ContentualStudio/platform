"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { safeExternalUrl } from "@/lib/instagram-posts";

/**
 * The post's image, or a placeholder when there is none — or when Meta's CDN
 * link has expired and the image no longer loads. Same pattern as UserAvatar:
 * `unoptimized` because the link is short-lived, and the failure is keyed to
 * the URL so a fresh link after the next pull is tried again.
 */
export function PostThumb({ src }: { src: string | null }) {
  const url = safeExternalUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <div className="relative flex size-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-control md:size-12">
      <ImageIcon aria-hidden className="size-5 text-muted opacity-60" />
      {url && failedUrl !== url ? (
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={48}
          onError={() => setFailedUrl(url)}
          referrerPolicy="no-referrer"
          src={url}
          unoptimized
          width={48}
        />
      ) : null}
    </div>
  );
}
