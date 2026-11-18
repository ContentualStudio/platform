const TIME_UNITS: ReadonlyArray<{
  readonly unit: Intl.RelativeTimeFormatUnit;
  readonly seconds: number;
}> = [
  { unit: "second", seconds: 1 },
  { unit: "minute", seconds: 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "week", seconds: 7 * 24 * 60 * 60 },
  { unit: "month", seconds: 30.4375 * 24 * 60 * 60 },
  { unit: "year", seconds: 365.25 * 24 * 60 * 60 },
];

export function formatRelativeTime(
  createdAt: string,
  now = Date.now(),
): string {
  const seconds = Math.round((new Date(createdAt).getTime() - now) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  let selectedUnit = TIME_UNITS[0];

  for (const candidate of TIME_UNITS) {
    if (absoluteSeconds < candidate.seconds) {
      break;
    }

    selectedUnit = candidate;
  }

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round(seconds / selectedUnit.seconds),
    selectedUnit.unit,
  );
}

export function shouldOpenNotificationFromKey(event: {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}): boolean {
  return (
    event.target === event.currentTarget &&
    (event.key === "Enter" || event.key === " ")
  );
}
