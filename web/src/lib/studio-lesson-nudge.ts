import { z } from "zod";

export const studioLessonNudgeSchema = z.object({
  category: z.string().min(1),
  lessonIds: z.array(z.string().min(1)).min(1),
});
export type StudioLessonNudge = z.infer<typeof studioLessonNudgeSchema>;

export function relatedLessonIds(
  value: string | string[] | undefined,
): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value ? [value] : []).filter(
        (id) => id.trim().length > 0,
      ),
    ),
  ];
}

export function studioLessonNudgeHref(nudge: StudioLessonNudge): string {
  const params = new URLSearchParams();
  for (const id of nudge.lessonIds) params.append("related", id);
  if (nudge.lessonIds.length === 1) params.set("lesson", nudge.lessonIds[0]);
  return `/studio/browse?${params.toString()}`;
}
