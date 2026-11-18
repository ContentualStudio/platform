/**
 * Every screen the visual pass reviews, and which persona can reach it.
 *
 * `path` is asserted against the URL after load. Without that assertion a
 * stage gate quietly redirecting a persona would produce nineteen screenshots
 * of the dashboard and a report full of confident nonsense.
 */

export type PersonaKey = "none" | "fresh" | "setup" | "welcome" | "active";

export interface Screen {
  id: string;
  /** Plain-English name, used in the report. */
  name: string;
  path: string;
  persona: PersonaKey;
}

export const SCREENS: Screen[] = [
  { id: "marketing", name: "Home", path: "/", persona: "none" },
  // /auth and /settings are not screens: both are one-line files that call
  // redirect(), so there is nothing on them to review. Their destinations are
  // listed instead.
  { id: "auth-sign", name: "Sign in", path: "/auth/sign", persona: "none" },

  { id: "onboarding", name: "Onboarding", path: "/onboarding", persona: "fresh" },
  { id: "challenge-setup", name: "Challenge setup", path: "/challenge-setup", persona: "setup" },
  {
    id: "challenge-welcome",
    name: "Programme welcome",
    path: "/challenge-setup/welcome",
    persona: "welcome",
  },

  { id: "dashboard", name: "Dashboard", path: "/dashboard", persona: "active" },
  { id: "cee-ai", name: "Cee AI", path: "/dashboard/cee-ai", persona: "active" },
  { id: "analytics", name: "Analytics", path: "/analytics", persona: "active" },
  { id: "programs", name: "Programs", path: "/programs", persona: "active" },
  { id: "planning", name: "Planning", path: "/planning", persona: "active" },
  { id: "platforms", name: "Platforms", path: "/platforms", persona: "active" },
  { id: "studio", name: "Studio", path: "/studio", persona: "active" },
];

/**
 * Settings sections are separate screens as far as a reviewer is concerned.
 *
 * Copied rather than imported: Playwright's loader cannot pull TypeScript
 * across workspace boundaries, so importing web/src/lib/settings.ts here fails
 * at run time. `tests/screens.test.ts` asserts this list still matches the one
 * the app routes from, which catches a new section being added without one.
 */
export const SETTINGS_SECTIONS = [
  "journey",
  "profile",
  "linked",
  "notifications",
  "account",
] as const;

export function allScreens(): Screen[] {
  return [
    ...SCREENS,
    ...SETTINGS_SECTIONS.map((section) => ({
      id: `settings-${section}`,
      name: `Settings — ${section}`,
      path: `/settings/${section}`,
      persona: "active" as const,
    })),
  ];
}

export const VIEWPORTS = [
  // Narrowest realistic device, below Tailwind's `sm`.
  { name: "mobile", width: 390, height: 844 },
  // Exactly on `md`, where off-by-one breakpoint bugs live.
  { name: "tablet", width: 768, height: 1024 },
  // Exactly on `xl`.
  { name: "laptop", width: 1280, height: 800 },
  // The design canvas.
  { name: "desktop", width: 1440, height: 900 },
] as const;

export const THEMES = ["light", "dark"] as const;
