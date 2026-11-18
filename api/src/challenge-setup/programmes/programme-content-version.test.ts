import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProgrammeContentRepository } from "./programme-content.repository";

const snapshot = {
  programme: {
    id: "programme-1",
    key: "starter",
    title: "Starter v1",
    description: "Pinned copy",
    durationDays: 7,
    experienceLevel: "beginner",
    difficulty: "easy",
    track: "starter",
    founderVideoUrl: null,
    expectations: null,
    ctaText: null,
    milestones: [],
    insightMoments: [],
  },
  modules: [],
  lessons: [],
  tasks: [
    {
      id: "task-1",
      key: "day-one",
      title: "Write the first hook",
      instructions: null,
      contentType: "caption",
      programmeId: "programme-1",
      moduleId: null,
      lessonId: null,
      dayNumber: 1,
      orderWithinDay: 1,
      dayType: "push",
      timeEstimateMinutes: 20,
      publishSlot: false,
      postNumber: null,
      pausePrompt: null,
      outputDescription: null,
    },
  ],
};

test("version reads use the immutable snapshot and never the current mirror", async () => {
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  const db = {
    query: async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM "programme_content_versions"')) {
        return [
          {
            programmeVersionId: "pv_v1",
            programmeKey: "starter",
            snapshot,
          },
        ];
      }
      return [];
    },
  };
  const reader = new ProgrammeContentRepository(db as never);

  const programme = await reader.findProgrammeVersion("pv_v1");
  const tasks = await reader.tasksForProgrammeVersion("pv_v1");

  assert.equal(programme?.title, "Starter v1");
  assert.equal(tasks[0]?.title, "Write the first hook");
  assert.equal(tasks[0]?.id, "day-one");
  assert.equal(calls.filter((call) => call.sql.includes('FROM "programme"')).length, 0);
  assert.deepEqual(calls[0]?.parameters, ["pv_v1"]);
});
