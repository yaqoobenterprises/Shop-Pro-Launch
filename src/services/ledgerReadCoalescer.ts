const pending = new Map<string, Promise<unknown>>();
/** Reuse only concurrent supporting reads. No settled financial data is retained. */
export function coalesceLedgerRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const current = pending.get(key);
  if (current) return current as Promise<T>;
  const request = load().finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}
