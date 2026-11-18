export type ProgramsTab = "overview" | "tasks" | "achievements" | "programmes";

export function parseProgramsTab(
  value: string | string[] | undefined | null,
): ProgramsTab {
  const tab = Array.isArray(value) ? value[0] : value;

  if (tab === "tasks" || tab === "achievements" || tab === "programmes") {
    return tab;
  }

  return "overview";
}
