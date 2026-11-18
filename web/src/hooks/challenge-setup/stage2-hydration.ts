import {
  stage2AnswersSchema,
  type ChallengeSetupStatus,
  type PlatformOption,
  type Stage2PartialAnswers,
} from "../../schemas/challenge-setup.schema";
import {
  stage2Steps,
  type Stage2FieldName,
  type Stage2FormState,
} from "../../stores/challenge-setup-store";

// The DB value may be null (never answered) or stale against the current enum
// (an option renamed/removed since it was saved) — only hydrate a field when
// it still validates against today's schema.
export function parseIfValid<T>(
  field: Stage2FieldName,
  raw: unknown,
): T | undefined {
  if (raw == null) {
    return undefined;
  }

  const result = stage2AnswersSchema.shape[field].safeParse(raw);
  return result.success ? (result.data as T) : undefined;
}

export function resolvePrimaryPlatformForSelection(
  platforms: readonly PlatformOption[],
  currentPrimary?: PlatformOption | null,
): PlatformOption | null {
  if (platforms.length === 0) {
    return null;
  }

  if (platforms.length === 1) {
    return platforms[0];
  }

  if (currentPrimary && platforms.includes(currentPrimary)) {
    return currentPrimary;
  }

  return platforms[0];
}

export function isStage2FieldValid(
  field: Stage2FieldName,
  answers: Stage2FormState,
): boolean {
  return stage2AnswersSchema.shape[field].safeParse(answers[field]).success;
}

// Answered fields are always a contiguous prefix (you can't advance past a
// step without a valid answer, and going back never clears a later step), so
// the resume point is the first field that doesn't validate.
export function findResumeIndex(answers: Stage2FormState): number {
  const index = stage2Steps.findIndex(
    (field) => !isStage2FieldValid(field, answers),
  );

  return index === -1 ? stage2Steps.length - 1 : index;
}

/**
 * Turns a saved setup into the form state the flow resumes from.
 *
 * Every field here comes from what the server actually holds. Nothing is
 * inferred: a value the client invents looks answered to `findResumeIndex`,
 * which then resumes *past* the step that would have saved it, and the flow
 * arrives at completion with an answer the server never received. That is
 * exactly what happened to `primaryPlatform` — a single selected platform was
 * treated as its own primary here, so the step never ran, the column stayed
 * null, and a user who later picked a second platform was refused at the last
 * step with nothing left to answer.
 *
 * The inference itself still happens — in `stage2StepPayload` when the
 * platforms step saves, so completion always receives a primary for one- or
 * two-platform selections without a dedicated questionnaire step.
 */
export function hydrateStage2Answers(
  source: ChallengeSetupStatus["answers"],
): Stage2FormState {
  return {
    platforms: parseIfValid("platforms", source.platforms),
    primaryPlatform: parseIfValid("primaryPlatform", source.primaryPlatform),
    postingGoal: parseIfValid("postingGoal", source.postingGoal),
    weeklyCommitment: parseIfValid("weeklyCommitment", source.weeklyCommitment),
    availableDays: parseIfValid("availableDays", source.availableDays),
    sawTestimonial: parseIfValid("sawTestimonial", source.sawTestimonial) ?? true,
    nicheDefined: parseIfValid("nicheDefined", source.nicheDefined),
    contentType: parseIfValid("contentType", source.contentType),
    followerRange: parseIfValid("followerRange", source.followerRange),
    instagramConnected: parseIfValid(
      "instagramConnected",
      source.instagramConnected,
    ),
    milestone: source.milestone ?? "",
  };
}

/**
 * The body one step's save sends.
 *
 * Normally just the field that was answered. The exception is `platforms`,
 * which can invalidate an answer the server already holds: narrowing a
 * two-platform selection leaves `primaryPlatform` pointing at a platform the
 * user no longer creates on, and the server refuses that pair at completion
 * with a message about a step the flow has already passed. Clearing it in the
 * same write keeps the stored pair one the schema accepts, and sends the user
 * back through the primary step to choose again.
 */
export function stage2StepPayload(
  field: Stage2FieldName,
  value: unknown,
  answers: Stage2FormState,
): Stage2PartialAnswers {
  // An unanswered field must not be written. `primaryPlatform` carries a
  // `.default(null)` for server compatibility, so a payload built from an
  // `undefined` answer parses into an explicit `null` — a save that erases the
  // stored value rather than skipping it.
  if (value === undefined) {
    return {};
  }

  if (field !== "platforms") {
    return { [field]: value } as Stage2PartialAnswers;
  }

  const selected = Array.isArray(value) ? (value as PlatformOption[]) : [];
  const storedPrimary = answers.primaryPlatform;
  const primaryStillValid =
    typeof storedPrimary === "string" && selected.includes(storedPrimary);

  return {
    platforms: selected,
    primaryPlatform: resolvePrimaryPlatformForSelection(
      selected,
      primaryStillValid ? storedPrimary : null,
    ),
  } as Stage2PartialAnswers;
}

/**
 * Before matching, replay every answered field from local state so the server
 * holds a complete snapshot even when an earlier step save was skipped or
 * drifted (for example `primaryPlatform` after removing the dedicated step).
 */
export function buildFinalStage2SavePayload(
  answers: Stage2FormState,
): Stage2PartialAnswers {
  const platforms = answers.platforms;
  const payload: Stage2PartialAnswers = {};

  if (platforms?.length) {
    payload.platforms = platforms;
    payload.primaryPlatform = resolvePrimaryPlatformForSelection(
      platforms,
      answers.primaryPlatform ?? null,
    );
  }
  if (answers.postingGoal !== undefined) {
    payload.postingGoal = answers.postingGoal;
  }
  if (answers.weeklyCommitment !== undefined) {
    payload.weeklyCommitment = answers.weeklyCommitment;
  }
  if (answers.availableDays !== undefined) {
    payload.availableDays = answers.availableDays;
  }
  if (answers.sawTestimonial !== undefined) {
    payload.sawTestimonial = answers.sawTestimonial;
  }
  if (answers.nicheDefined !== undefined) {
    payload.nicheDefined = answers.nicheDefined;
  }
  if (answers.contentType !== undefined) {
    payload.contentType = answers.contentType;
  }
  if (answers.followerRange !== undefined) {
    payload.followerRange = answers.followerRange;
  }
  if (answers.instagramConnected !== undefined) {
    payload.instagramConnected = answers.instagramConnected;
  }
  if (answers.milestone !== undefined) {
    payload.milestone = answers.milestone;
  }

  return payload;
}
