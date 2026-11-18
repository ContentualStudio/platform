import * as assert from "node:assert/strict";
import { test } from "node:test";
import { assertDisposableTestDatabase } from "./test-database-guard";

// The application database — what the guard protects. Deliberately not named
// "…_test": a test database must differ from it by name, not only by host.
const appUrl = "postgresql://app:pw@localhost:5432/contentual";

test("a distinct disposable test database is accepted", () => {
  assert.doesNotThrow(() =>
    assertDisposableTestDatabase(
      "postgresql://app:pw@localhost:5432/contentual_test",
      appUrl,
    ),
  );
});

// A different spelling of the loopback interface is the same server, so the
// guard must not read it as a different one.
test("loopback aliases do not disguise the application database", () => {
  for (const host of ["127.0.0.1", "[::1]", "0.0.0.0", "LOCALHOST"]) {
    assert.throws(
      () =>
        assertDisposableTestDatabase(
          `postgresql://app:pw@${host}:5432/contentual_test`,
          "postgresql://app:pw@localhost:5432/contentual_test",
        ),
      /same database/i,
      `alias ${host} slipped past the guard`,
    );
  }
});

// Hosts we cannot prove are distinct — DNS alias, proxy, tunnel — must not be
// enough on their own to authorise destructive migrations.
test("a matching database name is refused even on a different host", () => {
  assert.throws(
    () =>
      assertDisposableTestDatabase(
        "postgresql://app:pw@db.internal:5432/contentual_test",
        "postgresql://app:pw@localhost:5432/contentual_test",
      ),
    /same name/i,
  );
});

// The whole point of parsing: these two strings differ but name one database.
test("credentials and query parameters cannot disguise the same database", () => {
  assert.throws(
    () =>
      assertDisposableTestDatabase(
        "postgresql://other:secret@localhost:5432/contentual?sslmode=disable",
        appUrl,
      ),
    /same database/i,
  );
});

test("an omitted port still matches the default port", () => {
  assert.throws(
    () =>
      assertDisposableTestDatabase(
        "postgresql://app:pw@localhost/contentual",
        "postgresql://app:pw@localhost:5432/contentual",
      ),
    /same database/i,
  );
});

test("a percent-encoded database name still matches its decoded twin", () => {
  assert.throws(
    () =>
      assertDisposableTestDatabase(
        // %74 is "t": spells the same database as appUrl once decoded.
        "postgresql://app:pw@localhost:5432/conten%74ual",
        appUrl,
      ),
    /same database/i,
  );
});

// Second, independent guard: even a database the identity check clears must
// look disposable, so a stray URL cannot run destructive migrations on real data.
test("a database whose name is not a test database is rejected", () => {
  assert.throws(
    () =>
      assertDisposableTestDatabase(
        "postgresql://app:pw@db.example.com:5432/contentual_prod",
        appUrl,
      ),
    /disposable/i,
  );
});

// "test" must be a whole token: a name that merely contains those letters is
// not a test database.
test("a name that only embeds the letters test is rejected", () => {
  for (const database of ["contest_prod", "latest", "testing_grounds_prod"]) {
    assert.throws(
      () =>
        assertDisposableTestDatabase(
          `postgresql://app:pw@db.example.com:5432/${database}`,
          appUrl,
        ),
      /disposable/i,
      `"${database}" was wrongly accepted as disposable`,
    );
  }
});

test("test as a whole token is accepted in the usual spellings", () => {
  for (const database of ["contentual_test", "test", "test_db", "ci-test-01"]) {
    assert.doesNotThrow(
      () =>
        assertDisposableTestDatabase(
          `postgresql://app:pw@db.example.com:5432/${database}`,
          appUrl,
        ),
      `"${database}" was wrongly rejected`,
    );
  }
});

test("a missing or malformed url is rejected", () => {
  assert.throws(() => assertDisposableTestDatabase(undefined, appUrl), /not set/i);
  assert.throws(
    () => assertDisposableTestDatabase("not-a-url", appUrl),
    /could not be parsed/i,
  );
  assert.throws(
    () => assertDisposableTestDatabase(appUrl, "not-a-url"),
    /could not be parsed/i,
  );
});

test("an unset application url does not disable the comparison", () => {
  assert.throws(
    () => assertDisposableTestDatabase("postgresql://app:pw@localhost/test_db", undefined),
    /DATABASE_URL/,
  );
});
