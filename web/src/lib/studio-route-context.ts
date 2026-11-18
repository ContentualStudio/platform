import { relatedLessonIds } from "@/lib/studio-lesson-nudge";
import { redirect } from "next/navigation";
import { getCurrentProgrammeServer } from "@/lib/server-current-programme";
import { getStudioLessonsServer } from "@/lib/server-studio-lessons";
import { loadStageContext } from "@/lib/stage-gate";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Shared entry for every Studio route: one parallel load, one Welcome-Page
 * gate, one platform fallback. The gate is an access-control decision, so it
 * lives here rather than being copied per route — a new Studio sub-route
 * cannot forget to apply it.
 */
export async function loadStudioRouteContext(searchParams: SearchParams) {
  const [{ profile, setup }, lessons, current, params] = await Promise.all([
    loadStageContext(),
    getStudioLessonsServer(),
    getCurrentProgrammeServer(),
    searchParams,
  ]);

  // Assigned but never begun still belongs on the Welcome Page; between
  // programmes, Studio simply renders without a programme header.
  if (!current && setup?.assignedProgramme && !setup.programmeStarted) {
    redirect("/challenge-setup/welcome");
  }

  const requestedLesson = params.lesson;
  const relatedIds = relatedLessonIds(params.related);

  return {
    current,
    initialLessonId:
      typeof requestedLesson === "string" ? requestedLesson : null,
    lessons: relatedIds.length
      ? lessons.filter((lesson) => relatedIds.includes(lesson.slug))
      : lessons,
    relatedLessonIds: relatedIds,
    // The viewer's own platform, used only to label a lesson that carries no
    // platform tag of its own. Dies once every row is backfilled.
    platformLabel:
      setup?.answers.primaryPlatform ??
      setup?.answers.platforms?.[0] ??
      profile.stage1.platforms?.[0] ??
      "Instagram",
    profile,
    setup,
  };
}
