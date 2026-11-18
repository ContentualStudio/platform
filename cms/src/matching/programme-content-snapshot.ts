/** JSON graph written to the app database for one published programme. */
export interface ProgrammeContentSnapshot {
  programme: {
    id: string;
    key: string;
    title: string;
    description: string | null;
    access: string | null;
    durationDays: number | null;
    experienceLevel: string | null;
    difficulty: string | number | null;
    track: string | null;
    minimumTier?: string | null;
    founderVideoUrl: string | null;
    expectations: unknown;
    ctaText: string | null;
    milestones: unknown[];
    insightMoments: unknown[];
  };
  modules: Array<{
    id: string;
    key: string;
    title: string;
    order: number;
    programmeId: string;
    lessonIds: string[];
  }>;
  lessons: Array<{
    id: string;
    key: string;
    title: string;
    summary: string | null;
    body: unknown;
    attachmentsIds: string[];
    minimumTier?: string | null;
  }>;
  tasks: Array<{
    id: string;
    key: string;
    title: string;
    instructions: unknown;
    contentType: string | null;
    programmeId: string | null;
    moduleId: string | null;
    lessonId: string | null;
    dayNumber: number | null;
    orderWithinDay: number | null;
    dayType: string | null;
    timeEstimateMinutes: number | null;
    publishSlot: boolean;
    postNumber: number | null;
    platform: string | null;
    cameraRequired: boolean;
    objective: string | null;
    openingLine: string | null;
    whyItMatters: unknown;
    pausePrompt: unknown;
    outputDescription: unknown;
  }>;
}
