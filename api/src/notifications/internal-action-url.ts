/* eslint-disable no-control-regex */

const UNSAFE_CONTROL = /[\u0000-\u001F\u007F\u2028\u2029]/;

export function isSafeInternalActionUrl(value: string): boolean {
  return (
    value === value.trim() &&
    /^\/(?![\\/])[^\\%\u0000-\u001F\u007F\u2028\u2029]*$/.test(value) &&
    !UNSAFE_CONTROL.test(value)
  );
}
