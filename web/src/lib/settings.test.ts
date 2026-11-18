import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSettingsSection,
  settingsSectionFromPathname,
  settingsSections,
} from "./settings";

test("settingsSections preserves the design handoff order", () => {
  assert.deepEqual(
    settingsSections.map((section) => section.slug),
    ["journey", "profile", "linked", "notifications", "account"],
  );
});

test("parseSettingsSection accepts a supported section", () => {
  assert.equal(parseSettingsSection("journey"), "journey");
});

test("parseSettingsSection rejects an unsupported section", () => {
  assert.equal(parseSettingsSection("security"), null);
  assert.equal(parseSettingsSection(undefined), null);
});

test("settingsSectionFromPathname resolves the active settings tab from the URL", () => {
  assert.equal(settingsSectionFromPathname("/settings/journey"), "journey");
  assert.equal(settingsSectionFromPathname("/settings/profile"), "profile");
  assert.equal(settingsSectionFromPathname("/settings/linked"), "linked");
  assert.equal(settingsSectionFromPathname("/dashboard"), null);
});
