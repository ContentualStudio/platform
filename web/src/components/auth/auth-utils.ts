export const resendWindowSeconds = 120;

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return "-";
  }

  if (name.length <= 2) {
    return `${name[0] ?? ""}***@${domain}`;
  }

  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

export function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  // AuthServiceError carries the api's code, but its message is already the
  // user-facing copy for anything not listed here, so fall through to it.
  if ("code" in error) {
    switch ((error as { code?: string }).code) {
      case "AUTH_ACCOUNT_NOT_FOUND":
        return "We couldn't find an account for that email. Sign up to create one.";
      case "AUTH_ACCOUNT_EXISTS":
        return "An account already exists for that email. Log in instead.";
      case "RATE_LIMITED":
        return error.message || "Too many requests. Please try again shortly.";
      default:
        break;
    }
  }

  switch (error.message) {
    case "INVALID_EMAIL":
      return "Please enter a valid email address.";
    case "INVALID_CODE":
      return "Invalid code. Please try again.";
    case "CODE_EXPIRED":
      return "That code has expired. Request a new code to continue.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Request a new code to continue.";
    case "RATE_LIMITED":
      return "Too many requests. Please try again shortly.";
    case "SEND_FAILED":
      return "We could not send a code. Please try again.";
    default:
      return error.message || fallback;
  }
}

export function getGoogleAuthErrorMessage(error?: string | string[]) {
  const code = Array.isArray(error) ? error[0] : error;

  switch (code) {
    case undefined:
    case "":
      return undefined;
    case "signup_disabled":
      // Never displayed: AuthSessionGate redirects this to
      // /auth/signup?error=no_google_account. Listed so it does not flash the
      // generic failure message below while that redirect is in flight.
      return undefined;
    case "google_config":
      return "Google sign-in is not configured yet. Please use email for now.";
    case "no_google_account":
      // Bounced here from /auth/sign: Google login found no account, so the
      // user is being invited to create one.
      return "We couldn't find an account for that Google account. Sign up to create one.";
    case "google_account_exists":
      return "An account already exists for that Google account. Log in instead.";
    default:
      // Better Auth puts its own codes on the URL (`signup_disabled`,
      // `access_denied`, and provider-specific ones), so anything unrecognised
      // is still a failed OAuth round trip.
      return "Google sign-in was cancelled or failed. Please try again.";
  }
}
