import { z } from "zod";

export const badgeCelebrationSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
  })
  .strict();

export const pendingBadgeCelebrationsSchema = z
  .object({ celebrations: z.array(badgeCelebrationSchema) })
  .strict();

export type BadgeCelebration = z.infer<typeof badgeCelebrationSchema>;

/**
 * A badge's artwork, named by its catalogue key — the same convention as the
 * design (`foundations-built` → `foundations-built.png`). A key that is not a
 * plain slug has no artwork rather than becoming part of a path.
 */
export function badgeArtworkSrc(key: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ? `/brand/badges/${key}.png` : null;
}

/**
 * Adds freshly read celebrations to the queue, oldest release first, skipping
 * any already queued, on screen, or dismissed this session — so a re-read
 * never presents the same badge twice, even before the server has recorded
 * the dismissal.
 */
export function mergePendingCelebrations(
  queue: readonly BadgeCelebration[],
  fetched: readonly BadgeCelebration[],
  exclude: ReadonlySet<string>,
): BadgeCelebration[] {
  const known = new Set([...exclude, ...queue.map((item) => item.id)]);

  return [...queue, ...fetched.filter((item) => !known.has(item.id))];
}
