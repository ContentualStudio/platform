const COVERS: Record<string, string> = {
  "15-day-jumpstart": "/brand/15-day-jumpstart-cover.png",
  "30-day-foundation": "/brand/30-day-foundation-cover.png",
  // Catalogue slugs with a cover that unambiguously belongs to them. Other
  // programmes keep the generic image until their own artwork is chosen.
  "thirty-day-foundations": "/brand/30-day-foundation-cover.png",
  "plateau-breaker": "/brand/covers/60-days-plateau-breaker.jpg",
  "youtube-deep-dive": "/brand/covers/platform-deep-dive-youtube.jpg",
};

export function coverForProgramme(id: string): string {
  return programmeCoverOrNull(id) ?? "/brand/challenge-hero-bg.jpg";
}

/** The programme's own artwork, or null where a generic image would mislead. */
export function programmeCoverOrNull(id: string): string | null {
  return COVERS[id] ?? null;
}
