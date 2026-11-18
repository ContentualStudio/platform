/** Six placeholder rows, so the list does not jump when it resolves. */
export function WeekAheadSkeleton() {
  return (
    <div aria-hidden data-skeleton className="w-full pb-14">
      <div className="mb-6 h-10 w-64 rounded-lg bg-foreground/5" />
      <div className="flex flex-col gap-3">
        {["one", "two", "three", "four", "five", "six"].map((row) => (
          <div className="h-20 rounded-2xl bg-foreground/5" key={row} />
        ))}
      </div>
    </div>
  );
}
