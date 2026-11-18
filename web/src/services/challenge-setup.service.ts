import { apiFetch } from "@/lib/api-client";
import {
  challengeSetupStatusSchema,
  programmeSchema,
  programmeWelcomeSchema,
  stage2PartialAnswersSchema,
  type ChallengeSetupStatus,
  type Programme,
  type ProgrammeWelcome,
  type Stage2PartialAnswers,
} from "@/schemas/challenge-setup.schema";
import {
  eligibleProgrammeSchema,
  type EligibleProgramme,
} from "@/schemas/eligible-programme.schema";

export class ChallengeSetupServiceError extends Error {
  constructor(
    message: string,
    readonly code = "CHALLENGE_SETUP_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "ChallengeSetupServiceError";
  }
}

async function request(path: string, init?: RequestInit) {
  const { response, rawPayload } = await apiFetch(path, init);

  if (!response.ok) {
    const payload = rawPayload as { code?: string; message?: string };
    throw new ChallengeSetupServiceError(
      payload.message ?? payload.code ?? "Challenge setup request failed.",
      payload.code ?? "CHALLENGE_SETUP_REQUEST_FAILED",
    );
  }

  return rawPayload;
}

export async function getChallengeSetupStatus(): Promise<ChallengeSetupStatus> {
  const payload = await request("/challenge-setup/me");
  return challengeSetupStatusSchema.parse(payload);
}

export async function saveStage2Partial(
  input: Stage2PartialAnswers,
): Promise<ChallengeSetupStatus> {
  const parsedInput = stage2PartialAnswersSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new ChallengeSetupServiceError(
      parsedInput.error.issues[0]?.message ??
        "The setup answers are invalid.",
      "INVALID_STAGE2_PAYLOAD",
    );
  }

  const payload = await request("/challenge-setup/stage2", {
    method: "POST",
    body: JSON.stringify(parsedInput.data),
  });

  const parsedStatus = challengeSetupStatusSchema.safeParse(payload);
  if (!parsedStatus.success) {
    throw new ChallengeSetupServiceError(
      "We saved your answer but couldn't read the server response. Please refresh and try again.",
      "INVALID_STAGE2_STATUS",
    );
  }

  return parsedStatus.data;
}

// Authored content for the Welcome Page. Separate from status so the page can
// hang its loading / error+retry states off this fetch specifically.
export async function getWelcomeContent(): Promise<Programme> {
  const payload = await request("/challenge-setup/welcome");
  return programmeSchema.parse(payload);
}

export async function getProgrammeWelcome(slug: string): Promise<ProgrammeWelcome> {
  const payload = await request(`/programmes/${encodeURIComponent(slug)}/welcome`);
  return programmeWelcomeSchema.parse(payload);
}

/** Starts the named programme; the api re-checks eligibility. */
export async function startProgramme(slug: string): Promise<ChallengeSetupStatus> {
  const payload = await request(`/programmes/${encodeURIComponent(slug)}/start`, {
    method: "POST",
  });
  return challengeSetupStatusSchema.parse(payload);
}

export async function beginProgramme(): Promise<ChallengeSetupStatus> {
  const payload = await request("/challenge-setup/begin", { method: "POST" });
  return challengeSetupStatusSchema.parse(payload);
}

/**
 * Every programme the user may start. The recommendation carousel uses it to
 * show alternatives beside the matched programme; a failure only costs those
 * alternatives, so callers treat it as optional.
 */
export async function getEligibleProgrammes(): Promise<EligibleProgramme[]> {
  const payload = await request("/programmes/eligible");
  return eligibleProgrammeSchema.array().parse(payload);
}
