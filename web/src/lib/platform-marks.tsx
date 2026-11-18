import type { ReactElement } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  PinterestIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/settings/platform-icons";

export type PlatformMark = {
  icon?: (props: { className?: string }) => ReactElement;
  /** Tailwind text color class for the brand glyph in questionnaire rows. */
  brandColor: string;
};

export const platformMarks: Record<string, PlatformMark> = {
  Facebook: { icon: FacebookIcon, brandColor: "text-[#1877F2]" },
  Instagram: { icon: InstagramIcon, brandColor: "text-[#E4405F]" },
  LinkedIn: { icon: LinkedInIcon, brandColor: "text-[#0A66C2]" },
  Pinterest: { icon: PinterestIcon, brandColor: "text-[#BD081C]" },
  TikTok: { icon: TikTokIcon, brandColor: "text-foreground" },
  "X (Twitter)": { icon: XIcon, brandColor: "text-foreground" },
  "X / Twitter": { icon: XIcon, brandColor: "text-foreground" },
  YouTube: { icon: YouTubeIcon, brandColor: "text-[#FF0000]" },
};

export function getPlatformMark(platform: string): PlatformMark | undefined {
  return platformMarks[platform];
}
