/** Read-only filter parsing; deliberately independent of transaction-entry parsing. */
export type TransactionSort = "newest" | "oldest" | "amount-high" | "amount-low";

export function parseAmountBound(input: string): number | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a nonnegative amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount exceeds safe monetary precision.");
  return Number(minor);
}
export function readAmountBounds(minimum: string, maximum: string) {
  try {
    const minAmountPaisa = parseAmountBound(minimum), maxAmountPaisa = parseAmountBound(maximum);
    if (minAmountPaisa !== undefined && maxAmountPaisa !== undefined && minAmountPaisa > maxAmountPaisa)
      throw new Error("Minimum amount must be on or below maximum amount.");
    return { minAmountPaisa, maxAmountPaisa, error: "" };
  } catch (error) {
    return { minAmountPaisa: undefined, maxAmountPaisa: undefined, error: error instanceof Error ? error.message : "Invalid amount range." };
  }
}
export function transactionOrder(sort: TransactionSort = "newest") {
  return { column: sort.startsWith("amount") ? "amount_paisa" : "device_entry_time", ascending: sort === "oldest" || sort === "amount-low" } as const;
}
export function exactMajorUnits(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new Error("Invalid recorded amount.");
  const value = BigInt(amount), absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
