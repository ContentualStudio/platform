interface OnboardingHeadingProps {
  text: string;
  accent?: string;
  className?: string;
}

export function OnboardingHeading({
  text,
  accent,
  className,
}: OnboardingHeadingProps) {
  const index = accent ? text.indexOf(accent) : -1;

  if (!accent || index === -1) {
    return <h2 className={className}>{text}</h2>;
  }

  return (
    <h2 className={className}>
      {text.slice(0, index)}
      <span className="text-accent">{accent}</span>
      {text.slice(index + accent.length)}
    </h2>
  );
}
