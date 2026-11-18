export function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-4xl font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
      {subtitle ? <p className="text-base text-muted">{subtitle}</p> : null}
    </div>
  );
}
