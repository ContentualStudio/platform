export function SettingsContentSkeleton() {
  return (
    <div aria-hidden className="w-full space-y-4" data-skeleton>
      <div className="h-24 rounded-2xl bg-foreground/5" />
      <div className="h-48 rounded-2xl bg-foreground/5" />
      <div className="h-48 rounded-2xl bg-foreground/5" />
    </div>
  );
}
