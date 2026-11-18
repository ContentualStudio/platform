import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPublishedProgrammeOptions,
  programmeOption,
} from "./programme-options";

test("numeric Payload programme ids are normalized for relationship values", () => {
  assert.deepEqual(
    programmeOption({ id: 42, key: "first-take", title: "First Take" }),
    { id: "42", key: "first-take", title: "First Take" },
  );
});

test("the programme picker follows every Payload page", async () => {
  const requested: string[] = [];
  const options = await loadPublishedProgrammeOptions(async (url) => {
    requested.push(String(url));
    const page = requested.length;
    return new Response(
      JSON.stringify({
        docs: [
          { id: page, key: `programme-${page}`, title: `Programme ${page}` },
        ],
        hasNextPage: page === 1,
        nextPage: page === 1 ? 2 : null,
      }),
    );
  });

  assert.deepEqual(options.map((option) => option.id), ["1", "2"]);
  assert.match(requested[0] ?? "", /limit=100/);
  assert.match(requested[1] ?? "", /page=2/);
});
