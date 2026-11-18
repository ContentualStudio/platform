import { apiFetch } from "@/lib/api-client";
import {
  notificationPreferencesSchema,
  profileResponseSchema,
  profileUpdateSchema,
  themePreferenceSchema,
  type NotificationPreferences,
  type PersistedThemePreference,
  type ProfileResponse,
  type ProfileUpdate,
} from "@/schemas/onboarding.schema";

export class ProfileServiceError extends Error {
  constructor(
    message: string,
    readonly code = "PROFILE_REQUEST_FAILED",
  ) {
    super(message);
    this.name = "ProfileServiceError";
  }
}

async function parseProfileResponse(
  response: Response,
  rawPayload: unknown,
): Promise<ProfileResponse> {
  if (!response.ok) {
    const payload = rawPayload as { code?: string; message?: string };
    throw new ProfileServiceError(
      payload.message ?? "We couldn't update your profile.",
      payload.code,
    );
  }

  return profileResponseSchema.parse(rawPayload);
}

export async function updateProfile(
  input: ProfileUpdate,
): Promise<ProfileResponse> {
  const body = profileUpdateSchema.parse(input);
  const result = await apiFetch("/profile/me", {
    method: "PATCH",
    body: JSON.stringify({
      ...body,
      bio: body.bio || null,
    }),
  });

  return parseProfileResponse(result.response, result.rawPayload);
}

export async function updateNotificationPreferences(
  input: NotificationPreferences,
): Promise<ProfileResponse> {
  const body = notificationPreferencesSchema.parse(input);
  const result = await apiFetch("/profile/me/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return parseProfileResponse(result.response, result.rawPayload);
}

export async function updateThemePreference(
  input: PersistedThemePreference,
): Promise<ProfileResponse> {
  const body = themePreferenceSchema.parse(input);
  const result = await apiFetch("/profile/me/theme", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return parseProfileResponse(result.response, result.rawPayload);
}

export async function uploadAvatar(file: File): Promise<ProfileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const result = await apiFetch("/profile/me/avatar", {
    method: "POST",
    body: formData,
    headers: {},
  });

  return parseProfileResponse(result.response, result.rawPayload);
}

export async function removeAvatar(): Promise<ProfileResponse> {
  const result = await apiFetch("/profile/me/avatar", {
    method: "DELETE",
  });

  return parseProfileResponse(result.response, result.rawPayload);
}
