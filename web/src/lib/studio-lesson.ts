import { z } from "zod";

export const studioLessonDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  locked: z.boolean(),
  minimumTier: z.enum(["free", "creator", "pro"]),
  lessonType: z.enum(["article", "video", "masterclass", "template"]),
  skillLevel: z.string().nullable(),
  platforms: z.array(z.string()),
  body: z.unknown(),
  vimeoVideoId: z.string().nullable(),
  templateUrl: z.string().nullable(),
});
export type StudioLessonDetail = z.infer<typeof studioLessonDetailSchema>;

export function safeContentUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function vimeoPlayerUrl(reference: string | null): string | null {
  if (!reference || !/^\d+(?:\/[a-zA-Z0-9]+)?$/.test(reference)) return null;
  const [id, hash] = reference.split("/");
  return `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0&badge=0&dnt=1${hash ? `&h=${hash}` : ""}`;
}
