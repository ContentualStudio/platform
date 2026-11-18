"use client";

import * as React from "react";
import { useTheme } from "@/components/theme/theme-provider";
import type { ThemePreference } from "@/lib/theme";

/** Pushes the server-stored theme preference into the client theme store. */
export function PersistedThemeSync({ theme }: { theme: ThemePreference }) {
  const { setPreference } = useTheme();

  React.useEffect(() => {
    setPreference(theme);
  }, [setPreference, theme]);

  return null;
}
