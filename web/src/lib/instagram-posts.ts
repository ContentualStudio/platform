import { z } from "zod";
import { formatUtcDay } from "./challenge-progress";

const metric = z.number().int().nonnegative().nullable();

export const instagramPostSchema = z
  .object({
    id: z.string().min(1),
    mediaType: z.string().nullable(),
    permalink: z.string().nullable(),
    postedAt: z.iso.datetime({ offset: true }).nullable(),
    caption: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    views: metric,
    likes: metric,
    comments: metric,
  })
  .strict();

export const instagramPostsResponseSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(false) }).strict(),
  z
    .object({
      connected: z.literal(true),
      recent: z.array(instagramPostSchema),
      top: z.array(instagramPostSchema),
    })
    .strict(),
]);

export type InstagramPost = z.infer<typeof instagramPostSchema>;
export type InstagramPostsResponse = z.infer<typeof instagramPostsResponseSchema>;
export type ConnectedInstagramPosts = Extract<
  InstagramPostsResponse,
  { connected: true }
>;

export function formatPostDate(postedAt: string | null): string | null {
  return postedAt ? formatUtcDay(new Date(postedAt)) : null;
}

const MEDIA_LABELS: Record<string, string> = {
  CAROUSEL_ALBUM: "Carousel",
  IMAGE: "Photo",
  REELS: "Reel",
  VIDEO: "Video",
};

/**
 * A row's title: the caption's first line, or — for a post with no caption —
 * its kind and date, e.g. "Reel · Oct 7".
 */
export function postTitle(post: InstagramPost): string {
  const firstLine = post.caption?.split("\n").find((line) => line.trim())?.trim();

  if (firstLine) {
    return firstLine;
  }

  const kind = (post.mediaType && MEDIA_LABELS[post.mediaType]) ?? "Post";
  const date = formatPostDate(post.postedAt);

  return date ? `${kind} · ${date}` : kind;
}

/** Only http(s) links are rendered; anything else is treated as absent. */
export function safeExternalUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
