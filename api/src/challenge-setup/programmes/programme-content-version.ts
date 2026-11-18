/**
 * The JSON stored for one immutable programme publication.
 *
 * This is deliberately a complete graph rather than a pointer back to the
 * content mirror. The mirror is a convenient current read model; this object is
 * the historical content an assignment is allowed to keep reading.
 */
export interface ProgrammeContentSnapshot {
  programme: ProgrammeContentSnapshotProgramme;
  modules: ProgrammeContentSnapshotModule[];
  lessons: ProgrammeContentSnapshotLesson[];
  tasks: ProgrammeContentSnapshotTask[];
}

export interface ProgrammeContentSnapshotProgramme {
  id: string;
  key: string;
  title: string;
  description: string | null;
  access: string | null;
  durationDays: number | null;
  experienceLevel: string | null;
  difficulty: string | number | null;
  track: string | null;
  /** Absent on snapshots published before the gate existed: read as "free". */
  minimumTier?: string | null;
  founderVideoUrl: string | null;
  expectations: unknown;
  ctaText: string | null;
  milestones: unknown[];
  insightMoments: unknown[];
}

export interface ProgrammeContentSnapshotModule {
  id: string;
  key: string;
  title: string;
  order: number;
  programmeId: string;
  lessonIds: string[];
}

export interface ProgrammeContentSnapshotLesson {
  id: string;
  key: string;
  title: string;
  summary: string | null;
  body: unknown;
  attachmentsIds: string[];
  /** Absent on older snapshots: read as free. */
  minimumTier?: string | null;
  /** Superseded by `minimumTier`; still read on snapshots that carry it. */
  paidOnly?: boolean;
}

export interface ProgrammeContentSnapshotTask {
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
}
