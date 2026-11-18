import type { LucideIcon } from "lucide-react";

interface SectionPlaceholderProps {
  description: string;
  icon: LucideIcon;
  title: string;
}

export function SectionPlaceholder({
  description,
  icon: Icon,
  title,
}: SectionPlaceholderProps) {
  return (
    <main className="flex min-h-[calc(100vh-5rem)] w-full items-center justify-center">
      <section className="w-full max-w-xl text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <p className="mb-2 text-sm font-semibold text-accent">Coming soon</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 text-base leading-6 text-muted-foreground">
          {description}
        </p>
      </section>
    </main>
  );
}
