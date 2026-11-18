export const settingsSections = [
  { label: "Your journey", slug: "journey" },
  { label: "Profile", slug: "profile" },
  { label: "Linked accounts", slug: "linked" },
  { label: "Notifications", slug: "notifications" },
  { label: "Account", slug: "account" },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["slug"];

export function parseSettingsSection(
  value: string | undefined,
): SettingsSection | null {
  return (
    settingsSections.find((section) => section.slug === value)?.slug ?? null
  );
}

export function settingsSectionFromPathname(
  pathname: string,
): SettingsSection | null {
  const segments = pathname.split("/").filter(Boolean);
  const settingsIndex = segments.indexOf("settings");

  if (settingsIndex === -1) {
    return null;
  }

  return parseSettingsSection(segments[settingsIndex + 1]);
}

export function settingsSectionLabel(section: SettingsSection): string {
  return (
    settingsSections.find((item) => item.slug === section)?.label ?? "Profile"
  );
}
