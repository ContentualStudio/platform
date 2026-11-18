"use client";

interface MilestoneStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function MilestoneStep({ value, onChange }: MilestoneStepProps) {
  return (
    <div className="flex w-full flex-col items-start">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
        What&apos;s your biggest <span className="text-accent">milestone</span>?
      </h2>
      <textarea
        autoFocus
        className="contentual-input mb-12 min-h-[140px] resize-none text-lg"
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Example: Reach 5,000 followers, post consistently for 30 days, land my first brand collaboration."
        value={value}
      />
    </div>
  );
}
