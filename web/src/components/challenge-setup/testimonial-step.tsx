"use client";

const TESTIMONIAL =
  "88% of creators experience barriers to growing their creator business. Getting stuck is normal. Staying stuck doesn't have to be.";

export function TestimonialStep() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[url('/brand/testimonial-bg.png')] bg-[length:auto] bg-[center_bottom] bg-no-repeat opacity-80"
      />
      <div className="relative z-1 flex w-full flex-col items-center px-4 text-center">
        <h2 className="max-w-4xl text-[clamp(30px,4vw,48px)] font-extrabold uppercase italic leading-tight tracking-tight text-foreground">
          &ldquo;{TESTIMONIAL}&rdquo;
        </h2>
        <p className="mt-2.5 text-sm font-bold uppercase tracking-[0.08em] text-muted">
          CreatorIQ
        </p>
      </div>
    </>
  );
}
