import { redirect } from "next/navigation";
import { getChallengeSetupServer } from "@/lib/server-challenge-setup";
import { getProfileServer } from "@/lib/server-profile";

// Shared entry gate for every protected onboarding-stage page. Loads profile
// and challenge-setup status in parallel (both cache()'d per request, so
// callers that also read them pay nothing extra) and enforces the common
// ladder once: unauthenticated -> sign in, Stage 1 incomplete -> onboarding.
// Stage-2 routing stays per-page since each route redirects differently.
export async function loadStageContext() {
  const [profile, setup] = await Promise.all([
    getProfileServer(),
    getChallengeSetupServer(),
  ]);

  if (!profile) {
    redirect("/auth/sign");
  }

  if (!profile.onboardingCompleted) {
    redirect("/onboarding");
  }

  return { profile, setup };
}
