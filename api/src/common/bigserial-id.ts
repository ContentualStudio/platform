// A bigserial row id as it arrives in a route parameter. Anything else cannot
// match a row, and must not reach a bigint cast, where it would raise rather
// than simply not match.
export function isBigserialId(value: string): boolean {
  return /^[1-9]\d{0,17}$/.test(value);
}
