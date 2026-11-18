import {
  contentEngineCatalogue,
  eventNameTokens,
  type ContentEngineCatalogue,
  type EventPayload,
} from "@contentual/content-engine-vocabulary";

const catalogue: ContentEngineCatalogue = contentEngineCatalogue;
const payload: EventPayload<typeof eventNameTokens.taskCompleted> = {
  userId: "user-1",
  programmeId: "programme-1",
  taskId: "task-1",
  contentType: "video",
};

void catalogue.events[eventNameTokens.taskCompleted].schema.parse(payload);

// The derived payload type is what makes a mistyped emit a compile error rather
// than a runtime rejection, so the negative cases are asserted here too: a
// consumer that could silently widen back to `Record<string, unknown>` would
// still pass the positive assignment above.
const programmeStartedPayload: EventPayload<
  typeof eventNameTokens.programmeStarted
> = {
  userId: "user-1",
  programmeId: "programme-1",
};

// @ts-expect-error programme.started requires programmeId
const missingProgramme: EventPayload<
  typeof eventNameTokens.programmeStarted
> = { userId: "user-1" };

const extraField: EventPayload<typeof eventNameTokens.programmeStarted> = {
  userId: "user-1",
  programmeId: "programme-1",
  // @ts-expect-error programme.started has no such field
  invented: true,
};

const mistypedStreak: EventPayload<typeof eventNameTokens.streakReached> = {
  userId: "user-1",
  // @ts-expect-error streak.reached counts with a number, not a string
  streakLength: "7",
};

void programmeStartedPayload;
void missingProgramme;
void extraField;
void mistypedStreak;
