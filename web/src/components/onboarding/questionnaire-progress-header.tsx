import { CeeMascot } from "@/components/brand/cee-mascot";
import { cn } from "@/lib/utils";

interface QuestionnaireProgressHeaderProps {
  stepIndex: number;
  totalSteps: number;
  showMascot?: boolean;
  showStepLabel?: boolean;
  showProgress?: boolean;
  mascotLayout?: "overlay" | "inline";
  className?: string;
}

export function QuestionnaireProgressHeader({
  stepIndex,
  totalSteps,
  showMascot = true,
  showStepLabel = true,
  showProgress = true,
  mascotLayout = "overlay",
  className,
}: QuestionnaireProgressHeaderProps) {
  const isInlineMascot = mascotLayout === "inline";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3",
        isInlineMascot ? "mb-6 pt-0" : "mb-12 pt-36 md:pt-[170px]",
        className,
      )}
    >
      {showMascot ? (
        <CeeMascot
          className={cn(
            "pointer-events-none",
            isInlineMascot
              ? "mx-auto"
              : "absolute left-1/2 top-0 -translate-x-1/2",
          )}
          expression="looking"
          size={124}
        />
      ) : null}
      {showStepLabel ? (
        <span className="text-sm font-medium text-muted">
          Step {stepIndex + 1} of {totalSteps}
        </span>
      ) : null}
      {showProgress ? (
        <div className="mb-10 flex w-full gap-1.5">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                index < stepIndex
                  ? "bg-accent"
                  : index === stepIndex
                    ? "bg-accent/50"
                    : "bg-border",
              )}
              key={index}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
