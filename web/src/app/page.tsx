import Image from "next/image";
import Link from "next/link";

// The approved landing collage: four programme covers across the top, three
// below, desaturated so the copy stays the focus. Positions are percentages of
// the viewport so the grid scales without reflowing.
const PANELS = [
  { src: "platform-deep-dive-linkedin", x: "0%", y: "-6%", w: "23.5%", h: "52%" },
  { src: "platform-deep-dive-tiktok", x: "25.5%", y: "-6%", w: "23.5%", h: "52%" },
  { src: "content-creation-engine", x: "51%", y: "-6%", w: "23.5%", h: "52%" },
  { src: "platform-deep-dive-youtube", x: "76.5%", y: "-6%", w: "23.5%", h: "52%" },
  { src: "engagement-accelerator", x: "0%", y: "49%", w: "32%", h: "60%" },
  { src: "60-days-plateau-breaker", x: "34%", y: "49%", w: "32%", h: "60%" },
  { src: "platform-deep-dive-instagram", x: "68%", y: "49%", w: "32%", h: "60%" },
] as const;

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen w-full items-center overflow-hidden bg-immersive-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-70 max-[1100px]:opacity-60"
      >
        {PANELS.map((panel, index) => (
          <span
            className="absolute overflow-hidden rounded-4xl bg-immersive-surface shadow-[0_44px_96px_rgba(0,0,0,0.58)]"
            key={panel.src}
            style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h }}
          >
            <Image
              alt=""
              className="object-cover brightness-[0.56] contrast-[1.05] grayscale-[0.62] saturate-50"
              fill
              priority={index < 4}
              sizes="33vw"
              src={`/brand/covers/${panel.src}.jpg`}
            />
            <span className="absolute inset-0 bg-black/40" />
          </span>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-1 bg-linear-to-r from-immersive-bg/60 from-16% via-immersive-bg/40 via-46% to-immersive-bg/18 max-[1100px]:from-immersive-bg/70 max-[1100px]:from-30% max-[1100px]:to-immersive-bg/46"
      />

      <div className="relative z-3 max-w-190 px-8 py-8 min-[921px]:pl-65">
        <Image
          alt="Contentual.studio"
          className="mb-16 h-auto w-65 drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
          height={40}
          priority
          src="/brand/wordmark-studio.png"
          width={472}
        />
        <h1 className="mb-8 text-3xl font-medium leading-normal tracking-tight text-immersive-fg [text-shadow:0_2px_22px_rgba(0,0,0,0.6)] min-[921px]:text-5xl min-[921px]:leading-normal">
          Join a community of
          <br />
          creators, better your
          <br />
          content and challenge
          <br />
          your creativity.
        </h1>
        <div className="flex flex-wrap gap-3 min-[921px]:gap-7">
          <Link
            className="flex h-13 w-35 items-center justify-center rounded-full bg-immersive-fg font-bold text-immersive-bg transition-transform hover:scale-[1.02]"
            href="/auth/sign"
          >
            Log In
          </Link>
          <Link
            className="flex h-13 w-[145px] items-center justify-center rounded-full bg-immersive-fg font-bold text-immersive-bg transition-transform hover:scale-[1.02]"
            href="/auth/signup"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  );
}
