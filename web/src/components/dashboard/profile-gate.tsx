import { redirect } from "next/navigation";
import { TelemetryIdentity } from "@/components/telemetry/telemetry-identity";
import { PersistedThemeSync } from "@/components/theme/persisted-theme-sync";
import { getProfileServer } from "@/lib/server-profile";

/**
 * Request-time half of the protected layout: bounces anonymous visitors to
 * sign-in, applies their stored theme, and ties this browser's analytics
 * identity to them. Renders no visible UI, so it can sit behind a `null`
 * Suspense fallback without leaving a hole in the shell.
 *
 * Analytics identity is resolved here because this is already the one place that
 * turns a request into a known user — `getProfileServer` is `cache()`d, so it
 * costs nothing extra — and because a layout cannot do it without blocking every
 * protected route on a session read.
 */
export async function ProfileGate() {
  const profile = await getProfileServer();

  if (!profile) {
    redirect("/auth/sign");
  }

  return (
    <>
      <PersistedThemeSync theme={profile.preferences.theme} />
      <TelemetryIdentity userId={profile.user.id} />
    </>
  );
}
