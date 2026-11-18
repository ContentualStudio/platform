const PROGRESS_SEGMENTS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const ANSWER_ROWS = ["1", "2", "3", "4", "5"];

/** Shell placeholder for the questionnaire while saved answers load. */
export function SetupSkeleton() {
  return (
    <div
      aria-label="Loading saved challenge setup answers"
      data-skeleton
      className="mx-auto flex min-h-screen w-full max-w-[840px] animate-pulse flex-col px-6 pt-24 md:pt-32"
      role="status"
    >
      <div className="mb-10 flex gap-1.5">
        {PROGRESS_SEGMENTS.map((segment) => (
          <div className="h-1 flex-1 rounded-full bg-border" key={segment} />
        ))}
      </div>
      <div className="h-10 w-3/4 rounded-2xl bg-surface" />
      <div className="mt-8 flex flex-col gap-3">
        {ANSWER_ROWS.map((row) => (
          <div className="h-[52px] rounded-lg bg-surface" key={row} />
        ))}
      </div>
    </div>
  );
}
