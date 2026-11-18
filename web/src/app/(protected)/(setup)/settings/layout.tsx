import { Suspense } from "react";
import { SettingsFrameLoader } from "@/components/settings/settings-frame-loader";
import { HeaderSkeleton } from "@/components/dashboard/shell-skeletons";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="-m-2.5 w-[calc(100%+20px)] pb-12">
      <Suspense fallback={<HeaderSkeleton />}>
        <SettingsFrameLoader />
      </Suspense>
      {children}
    </main>
  );
}
