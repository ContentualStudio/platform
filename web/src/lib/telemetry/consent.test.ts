import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasTrackingConsent,
  trackingConsentCookie,
  trackingConsentFrom,
  trackingConsentValues,
} from "./consent";

// The whole point of the gate: an unasked user has not agreed to anything, and
// the consent banner that writes this cookie does not exist yet.
test("no cookie header means denied", () => {
  assert.equal(trackingConsentFrom(undefined), trackingConsentValues.denied);
  assert.equal(trackingConsentFrom(null), trackingConsentValues.denied);
  assert.equal(trackingConsentFrom(""), trackingConsentValues.denied);
});

test("an explicit grant is honoured", () => {
  assert.equal(
    trackingConsentFrom(`${trackingConsentCookie}=granted`),
    trackingConsentValues.granted,
  );
  assert.equal(hasTrackingConsent(`${trackingConsentCookie}=granted`), true);
});

test("an explicit denial is denied", () => {
  assert.equal(
    trackingConsentFrom(`${trackingConsentCookie}=denied`),
    trackingConsentValues.denied,
  );
});

test("the cookie is found among others", () => {
  assert.equal(
    hasTrackingConsent(
      `theme=dark; ${trackingConsentCookie}=granted; better-auth.session=abc`,
    ),
    true,
  );
});

// A stale value from an older banner, or anything a proxy mangled, must not read
// as consent.
test("any value other than granted is denied", () => {
  for (const value of ["yes", "true", "1", "GRANTED", "", "granted-later"]) {
    assert.equal(
      hasTrackingConsent(`${trackingConsentCookie}=${value}`),
      false,
      `${value} must not read as consent`,
    );
  }
});

// A cookie whose name merely ends with ours is a different cookie.
test("a similarly named cookie does not grant consent", () => {
  assert.equal(
    hasTrackingConsent(`not_${trackingConsentCookie}=granted`),
    false,
  );
});

test("a url-encoded value is decoded before comparison", () => {
  assert.equal(
    hasTrackingConsent(`${trackingConsentCookie}=${encodeURIComponent("granted")}`),
    true,
  );
});

test("a malformed pair is skipped rather than throwing", () => {
  assert.equal(
    hasTrackingConsent(`broken; ${trackingConsentCookie}=granted`),
    true,
  );
});
