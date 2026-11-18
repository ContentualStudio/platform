"use client";

import { CeeMascot } from "@/components/brand/cee-mascot";

export function CeeComingSoon() {
  return (
    <section
      className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center bg-[radial-gradient(circle_at_50%_32%,rgba(249,86,22,0.14),transparent_30%)] px-6 py-12 text-center max-[920px]:pb-28"
    >
      <div className="mx-auto flex max-w-180 flex-col items-center">
        <CeeMascot className="mb-6" expression="idle" size={180} />
        <p className="text-xs font-extrabold uppercase tracking-widest text-accent">
          Coming soon
        </p>
        <h1 className="mt-3 text-5xl font-black leading-none tracking-tight text-foreground sm:text-6xl">
          Meet Cee.
        </h1>
        <p className="mt-4 max-w-145 text-lg text-muted">
          Your personal AI content guide is currently being shaped and trained
          on over 11 years of the world&apos;s best content strategy research
          and principles.
        </p>
      </div>
    </section>
  );
}
