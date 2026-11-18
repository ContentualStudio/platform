import type { FieldAccess } from "payload";

// The engine collections key their mirror rows on an immutable `key`. Because
// these collections use drafts with autosave, Payload creates the row the moment
// the form is touched — before the author has typed a key. Locking the field
// from creation would therefore make it impossible to ever set. Instead it stays
// editable while empty and locks once it holds a value.
export const lockKeyOnceSet: FieldAccess = ({ doc }) => {
  const current = (doc as { key?: unknown } | undefined)?.key;
  return typeof current !== "string" || current.trim() === "";
};
