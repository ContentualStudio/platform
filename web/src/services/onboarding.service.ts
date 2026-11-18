import { apiFetch } from "@/lib/api-client";
import {
  profileResponseSchema,
  stage1PartialAnswersSchema,
  type ProfileResponse,
  type Stage1PartialAnswers,
} from "@/schemas/onboarding.schema";

export class OnboardingServiceError extends Error {
  constructor(
    message: string,
    readonly code = "ONBOARDING_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "OnboardingServiceError";
  }
}

async function request(path: string, init?: RequestInit) {
  const { response, rawPayload } = await apiFetch(path, init);

  if (!response.ok) {
    const payload = rawPayload as { code?: string; message?: string };
    throw new OnboardingServiceError(
      payload.message ?? payload.code ?? "Onboarding request failed.",
      payload.code ?? "ONBOARDING_REQUEST_FAILED",
    );
  }

  return rawPayload;
}

export async function getProfile(): Promise<ProfileResponse> {
  const payload = await request("/profile/me");
  return profileResponseSchema.parse(payload);
}

export async function saveStage1Partial(
  input: Stage1PartialAnswers,
): Promise<ProfileResponse> {
  const body = stage1PartialAnswersSchema.parse(input);
  const payload = await request("/profile/onboarding/stage1", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return profileResponseSchema.parse(payload);
}
