import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SetupSkeleton } from "@/components/challenge-setup/setup-skeleton";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { WelcomePage } from "@/components/programme/welcome-page";
import { greetingFirstName } from "@/lib/display-name";
import { loadStageContext } from "@/lib/stage-gate";

// The Welcome Page for one programme chosen from the eligible list. Whether it
// can start is decided by the api; this page only renders that answer.
export default function ProgrammeSlugWelcomePage({
  params,
  searchParams,
}: PageProps<"/programs/[slug]/welcome">) {
  return (
    <RetryBoundary description="We couldn't load this programme. Please try again.">
      <Suspense fallback={<SetupSkeleton />}>
        <ProgrammeSlugWelcomeContent params={params} searchParams={searchParams} />
      </Suspense>
    </RetryBoundary>
  );
}

async function ProgrammeSlugWelcomeContent({
  params,
  searchParams,
}: Pick<PageProps<"/programs/[slug]/welcome">, "params" | "searchParams">) {
  const [{ slug }, query, { profile, setup }] = await Promise.all([
    params,
    searchParams,
    loadStageContext(),
  ]);

  if (!setup?.setupCompleted) {
    redirect("/challenge-setup");
  }

  return (
    <WelcomePage
      name={greetingFirstName({
        email: profile.user.email,
        name: profile.stage1.name || profile.user.name,
      })}
      // Opened from a programme history row: offer the way back there.
      back={query.from === "history" ? { href: "/programs/history", label: "Back to history" } : undefined}
      slug={slug}
    />
  );
}
