/** Exact signed PostgreSQL BIGINT-compatible money boundary. No float coercion. */
const MAX_MINOR = 9_223_372_036_854_775_807n;
const MIN_MINOR = -MAX_MINOR - 1n;

export function parseMinorUnits(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(value)) {
    throw new Error("Money must be a canonical decimal integer string.");
  }
  if (value.length > 20) throw new Error("Money exceeds supported 64-bit minor-unit range.");
  const result = BigInt(value);
  if (result < MIN_MINOR || result > MAX_MINOR) {
    throw new Error("Money exceeds supported 64-bit minor-unit range.");
  }
  return result;
}

export function addExact(left: bigint, right: bigint): bigint {
  const sum = left + right;
  if (sum < MIN_MINOR || sum > MAX_MINOR) {
    throw new Error("Exact money aggregate exceeds supported range.");
  }
  return sum;
}

export function validBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(`${value}T`);
}
