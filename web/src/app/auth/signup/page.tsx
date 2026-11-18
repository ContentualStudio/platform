import { Suspense } from "react";
import { AuthFlow } from "@/components/auth/auth-flow";
import { AuthSessionGate } from "@/components/auth/auth-session-gate";

// Same shape as /auth/sign: the form is the static shell, and the already-
// signed-in check renders no UI beside it. See that page for why there is no
// RetryBoundary.
export default function AuthSignupPage({
  searchParams,
}: PageProps<"/auth/signup">) {
  return (
    <>
      <Suspense fallback={null}>
        <AuthSessionGate mode="signup" searchParams={searchParams} />
      </Suspense>
      <AuthFlow mode="signup" />
    </>
  );
}
