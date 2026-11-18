export const MAX_FOCUS_PLATFORMS = 2;

export function togglePlatformSelection<T extends string>(
  selected: T[],
  option: T,
): { selection: T[]; limitReached: boolean } {
  if (selected.includes(option)) {
    return {
      selection: selected.filter((item) => item !== option),
      limitReached: false,
    };
  }

  if (selected.length >= MAX_FOCUS_PLATFORMS) {
    return { selection: selected, limitReached: true };
  }

  return { selection: [...selected, option], limitReached: false };
}
