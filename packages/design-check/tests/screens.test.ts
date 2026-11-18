import assert from "node:assert/strict";
import { test } from "node:test";

import { settingsSections } from "../../../web/src/lib/settings.js";
import { THEME_STORAGE_KEY } from "../../../web/src/lib/theme.js";

import { SETTINGS_SECTIONS, allScreens } from "../visual/screens.js";

/**
 * The visual pass copies two small values out of the app rather than importing
 * them, because Playwright's loader cannot pull TypeScript across a workspace
 * boundary. These tests are what stop the copies drifting: node:test runs under
 * tsx, which has no such limitation, so the real modules can be imported here.
 */
test("the reviewed settings sections match the ones the app routes from", () => {
  assert.deepEqual(
    [...SETTINGS_SECTIONS],
    settingsSections.map((section) => section.slug),
    "a settings section was added or renamed without updating the visual pass, " +
      "so it would go unreviewed",
  );
});

test("the theme key the visual pass writes is the one the app reads", () => {
  assert.equal(
    THEME_STORAGE_KEY,
    "theme",
    "visual/audit.spec.ts writes this key to set the theme; if it changes there, " +
      "every screenshot silently renders in the default theme",
  );
});

test("every screen has a unique id and an absolute path", () => {
  const ids = allScreens().map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "screen ids must be unique — they name the files");
  for (const screen of allScreens()) {
    assert.ok(screen.path.startsWith("/"), `${screen.id} has a relative path`);
  }
});
