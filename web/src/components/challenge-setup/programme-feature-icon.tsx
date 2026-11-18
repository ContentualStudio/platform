import { CalendarDays, Clock, Target, Zap } from "lucide-react";
import type { Programme } from "@/schemas/challenge-setup.schema";

const icons = {
  clock: Clock,
  calendar: CalendarDays,
  spark: Zap,
  target: Target,
} as const;

export function ProgrammeFeatureIcon({
  icon,
  className,
}: {
  icon: Programme["features"][number]["icon"];
  className?: string;
}) {
  const Icon = icons[icon] ?? Clock;
  return <Icon className={className} />;
}
