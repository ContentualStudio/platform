import * as React from "react";
import { cn } from "@/lib/utils";
// lucide-react dropped its brand marks in v1, so the platform glyphs are
// inline SVGs — same approach as GoogleIcon in components/auth. They paint in
// `currentColor` so the caller tints them with a design token.

interface PlatformIconProps {
  className?: string;
}

export function YouTubeIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function FacebookIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function InstagramIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function LinkedInIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export function TikTokIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06V9.68a5.67 5.67 0 0 0-.77-.05A5.68 5.68 0 1 0 15.54 15.3V8.9a7.34 7.34 0 0 0 4.29 1.38V7.19a4.29 4.29 0 0 1-3.23-1.37z" />
    </svg>
  );
}

export function XIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function PinterestIcon({ className }: PlatformIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.424 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.965 1.406-5.965s-.359-.72-.359-1.779c0-1.666.967-2.911 2.169-2.911 1.024 0 1.518.769 1.518 1.69 0 1.029-.653 2.568-.992 3.992-.285 1.193.597 2.166 1.775 2.166 2.129 0 3.768-2.245 3.768-5.487 0-2.861-2.056-4.863-4.991-4.863-3.398 0-5.394 2.551-5.394 5.191 0 1.029.396 2.133.89 2.733.099.12.112.225.085.347-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.697-2.433-2.888-2.433-4.649 0-3.785 2.752-7.263 7.937-7.263 4.167 0 7.406 2.968 7.406 6.938 0 4.141-2.607 7.474-6.204 7.474-1.211 0-2.35-.629-2.738-1.373l-.745 2.838c-.269 1.038-1 2.335-1.49 3.129 1.123.345 2.316.533 3.553.533 6.62 0 11.987-5.367 11.987-11.987C24.014 5.367 18.637.001 12.017.001Z" />
    </svg>
  );
}

/**
 * Brand glyph for questionnaire option rows — full brand color, no tile.
 * Matches design `.option-platform .brand-mark` at 22px.
 */
export function PlatformOptionMark({
  icon: Icon,
  brandColor,
  selected = false,
}: {
  icon: (props: { className?: string }) => React.ReactElement;
  brandColor: string;
  selected?: boolean;
}) {
  return (
    <Icon
      className={cn(
        "size-[22px] shrink-0",
        selected ? "text-inherit" : brandColor,
      )}
    />
  );
}

/**
 * The rounded tile a platform glyph sits in.
 *
 * Shared by the settings cards and the platforms screen: the two had drifted a
 * corner radius and a glyph size apart while showing the same thing.
 */
export function PlatformIcon({
  icon: Icon,
  tone,
}: {
  icon: (props: { className?: string }) => React.ReactElement;
  tone: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md",
        tone,
      )}
    >
      <Icon className="size-5.5" />
    </span>
  );
}
