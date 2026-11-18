import { Suspense } from "react";
import { AuthFlow } from "@/components/auth/auth-flow";
import { AuthSessionGate } from "@/components/auth/auth-session-gate";

// Log-in is the app's cold-start entry point, so the whole form prerenders as
// the static shell. The only request-time work — "are you already signed in?"
// — renders no UI, so it sits in a null-fallback boundary beside the form
// instead of in front of it. No RetryBoundary here on purpose: the gate fails
// open to the form, which is the recovery, so there is nothing to retry.
export default function AuthSignPage({
  searchParams,
}: PageProps<"/auth/sign">) {
  return (
    <>
      <Suspense fallback={null}>
        <AuthSessionGate mode="login" searchParams={searchParams} />
      </Suspense>
      <AuthFlow mode="login" />
    </>
  );
}
