import { redirect } from "next/navigation";
import { getProfileServer } from "@/lib/server-profile";
import type { AuthIntent } from "@/schemas/auth.schema";

interface AuthSessionGateProps {
  mode: AuthIntent;
  /** Passed as a promise and awaited here, so the page itself never blocks. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Renders no UI. Lives in its own `<Suspense fallback={null}>` alongside the
 * auth form so the form stays in the prerendered shell — the session check is
 * only needed to bounce someone who is *already* signed in, which is the rare
 * case on these routes, and making everyone wait behind a skeleton for it put
 * an api round trip in front of every visit.
 */
export async function AuthSessionGate({
  mode,
  searchParams,
}: AuthSessionGateProps) {
  // Fails open to the form: if the api is unreachable we cannot prove there is
  // a session, and showing a working sign-in form is the right recovery. The
  // protected routes do their own gating, so nothing is granted by guessing
  // wrong here. redirect() throws, so it must stay outside this catch.
  const profile = await getProfileServer().catch(() => null);

  if (profile?.onboardingCompleted) {
    redirect("/dashboard");
  }

  if (profile) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  // Better Auth blocks account creation on the log-in door
  // (`disableImplicitSignUp`), so an unknown Google account lands back there as
  // `signup_disabled`. There is nothing to do on the log-in page, so hand them
  // to sign-up with the reason.
  if (mode === "login" && error === "signup_disabled") {
    redirect("/auth/signup?error=no_google_account");
  }

  return null;
}
