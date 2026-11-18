import assert from "node:assert/strict";
import test from "node:test";

import {
  conditionSourceTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";

import {
  addRow,
  decodeFieldChoice,
  emptyRow,
  encodeFieldChoice,
  fieldChoiceGroups,
  fieldOptionFor,
  isListOperator,
  operatorChoicesFor,
  removeRow,
  rowsForEvent,
  withField,
  withListEntry,
  withListEntryAdded,
  withListEntryRemoved,
  withOperator,
  withScalarValue,
} from "./condition-editor";

const taskCompleted = eventNameTokens.taskCompleted;

test("groups selectable fields by source", () => {
  const groups = fieldChoiceGroups(taskCompleted);

  assert.deepEqual(
    groups.map((group) => group.label),
    ["Event fields", "User attributes"],
  );
  assert.deepEqual(groups[0].options[3], {
    label: "contentType",
    type: "string",
    value: encodeFieldChoice(conditionSourceTokens.event, "contentType"),
  });
  assert.equal(
    groups[1].options.some(
      (option) =>
        option.value ===
        encodeFieldChoice(conditionSourceTokens.user, "programmes_completed"),
    ),
    true,
  );
});

test("encodes the source into the choice so same-named fields stay distinct", () => {
  const encoded = encodeFieldChoice(conditionSourceTokens.user, "user_type");

  assert.notEqual(
    encoded,
    encodeFieldChoice(conditionSourceTokens.event, "user_type"),
  );
  assert.deepEqual(decodeFieldChoice(encoded), {
    source: conditionSourceTokens.user,
    field: "user_type",
  });
  assert.equal(decodeFieldChoice("nonsense"), null);
});

test("looks up the selected field's definition, and nothing else", () => {
  assert.deepEqual(
    fieldOptionFor(taskCompleted, {
      source: conditionSourceTokens.event,
      field: "contentType",
    }),
    { source: conditionSourceTokens.event, field: "contentType", type: "string" },
  );
  // A field of another event is not selectable here.
  assert.equal(
    fieldOptionFor(taskCompleted, {
      source: conditionSourceTokens.event,
      field: "consecutiveSkipCount",
    }),
    null,
  );
  assert.equal(fieldOptionFor(taskCompleted, {}), null);
});

test("offers only the operators the selected field type allows", () => {
  assert.deepEqual(operatorChoicesFor("number"), [
    operatorTokens.eq,
    operatorTokens.neq,
    operatorTokens.in,
    operatorTokens.gte,
    operatorTokens.lte,
  ]);
  assert.deepEqual(operatorChoicesFor("string"), [
    operatorTokens.eq,
    operatorTokens.neq,
    operatorTokens.in,
  ]);
  assert.deepEqual(operatorChoicesFor(null), []);
  assert.equal(isListOperator(operatorTokens.in), true);
  assert.equal(isListOperator(operatorTokens.eq), false);
});

test("resets the operator and value when the field changes", () => {
  const row = {
    source: conditionSourceTokens.user,
    field: "programmes_completed",
    operator: operatorTokens.gte,
    value: 3,
  };

  assert.deepEqual(
    withField(
      row,
      taskCompleted,
      encodeFieldChoice(conditionSourceTokens.event, "contentType"),
    ),
    {
      source: conditionSourceTokens.event,
      field: "contentType",
      operator: undefined,
      value: undefined,
    },
  );
});

test("keeps the value when the operator's cardinality is unchanged", () => {
  const row = {
    source: conditionSourceTokens.event,
    field: "contentType",
    operator: operatorTokens.eq,
    value: "video",
  };

  assert.equal(
    withOperator(row, taskCompleted, operatorTokens.neq).value,
    "video",
  );
});

test("clears the value when the operator changes cardinality", () => {
  const scalar = {
    source: conditionSourceTokens.event,
    field: "contentType",
    operator: operatorTokens.eq,
    value: "video",
  };
  const list = withOperator(scalar, taskCompleted, operatorTokens.in);

  assert.deepEqual(list.value, []);
  assert.equal(
    withOperator(list, taskCompleted, operatorTokens.eq).value,
    undefined,
  );
});

test("stores typed scalars without coercing across types", () => {
  const numberRow = {
    source: conditionSourceTokens.user,
    field: "programmes_completed",
    operator: operatorTokens.gte,
  };

  assert.equal(withScalarValue(numberRow, taskCompleted, "3").value, 3);
  // An unparseable number is left unset rather than stored as text, so the
  // server never sees a mistyped value from this editor.
  assert.equal(withScalarValue(numberRow, taskCompleted, "").value, undefined);
  assert.equal(
    withScalarValue(numberRow, taskCompleted, "three").value,
    undefined,
  );

  const booleanRow = {
    source: conditionSourceTokens.user,
    field: "is_founding_creator",
    operator: operatorTokens.eq,
  };

  assert.equal(withScalarValue(booleanRow, taskCompleted, "true").value, true);
  assert.equal(withScalarValue(booleanRow, taskCompleted, "false").value, false);
  assert.equal(withScalarValue(booleanRow, taskCompleted, "").value, undefined);

  const stringRow = {
    source: conditionSourceTokens.event,
    field: "contentType",
    operator: operatorTokens.eq,
  };

  assert.equal(withScalarValue(stringRow, taskCompleted, "video").value, "video");
});

test("edits list values entry by entry rather than by splitting text", () => {
  const row = {
    source: conditionSourceTokens.user,
    field: "subscription_status",
    operator: operatorTokens.in,
    value: ["pro"],
  };

  const added = withListEntryAdded(row);
  assert.deepEqual(added.value, ["pro", ""]);

  // A comma belongs to the value, not to the encoding.
  const edited = withListEntry(added, taskCompleted, 1, "trial, extended");
  assert.deepEqual(edited.value, ["pro", "trial, extended"]);

  assert.deepEqual(withListEntryRemoved(edited, 0).value, ["trial, extended"]);
});

test("types each list entry from the selected field", () => {
  const row = {
    source: conditionSourceTokens.user,
    field: "programmes_completed",
    operator: operatorTokens.in,
    value: [1],
  };

  assert.deepEqual(
    withListEntry(withListEntryAdded(row), taskCompleted, 1, "2").value,
    [1, 2],
  );
});

test("adds and removes rows", () => {
  const rows = [emptyRow()];

  assert.equal(addRow(rows).length, 2);
  assert.deepEqual(removeRow(addRow(rows), 0).length, 1);
  assert.deepEqual(emptyRow(), {
    source: undefined,
    field: undefined,
    operator: undefined,
    value: undefined,
  });
});

test("clears selections a new trigger event cannot read", () => {
  const rows = [
    {
      source: conditionSourceTokens.event,
      field: "consecutiveSkipCount",
      operator: operatorTokens.gte,
      value: 2,
    },
    {
      source: conditionSourceTokens.user,
      field: "programmes_completed",
      operator: operatorTokens.gte,
      value: 2,
    },
  ];

  // User attributes survive any trigger change; an event field that the new
  // trigger does not declare cannot silently stay selected.
  assert.deepEqual(rowsForEvent(rows, taskCompleted), [
    emptyRow(),
    {
      source: conditionSourceTokens.user,
      field: "programmes_completed",
      operator: operatorTokens.gte,
      value: 2,
    },
  ]);

  assert.deepEqual(rowsForEvent(rows, eventNameTokens.taskSkipped), rows);
  assert.deepEqual(rowsForEvent(rows, null), rows);
});
