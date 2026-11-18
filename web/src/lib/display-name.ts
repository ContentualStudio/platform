/**
 * Auth seeds `user.name` from the email local-part for OTP sign-up
 * (`alexander.joshua2018` from `alexander.joshua2018@gmail.com`). That is not
 * a display name — greetings and onboarding must not treat it as one.
 */
export function isEmailDerivedName(
  name: string | null | undefined,
  email?: string | null,
): boolean {
  const trimmed = name?.trim() ?? "";

  if (!trimmed) {
    return true;
  }

  const localPart = email?.split("@")[0]?.trim();

  if (!localPart) {
    return false;
  }

  return trimmed.toLowerCase() === localPart.toLowerCase();
}

/** Full display name, or null when only an email-derived placeholder exists. */
export function displayNameFromProfile(input: {
  email?: string | null;
  name?: string | null;
}): string | null {
  const name = input.name?.trim() ?? "";

  if (!name || isEmailDerivedName(name, input.email)) {
    return null;
  }

  return name;
}

/** First name for greetings (“James.”), or null when unknown. */
export function greetingFirstName(input: {
  email?: string | null;
  name?: string | null;
}): string | null {
  const displayName = displayNameFromProfile(input);

  if (!displayName) {
    return null;
  }

  return displayName.split(/\s+/)[0] || null;
}
