/** Quote PostgREST filter values so punctuation cannot become additional filter clauses. */
export function transactionSearchFilter(value: string): string {
  const escaped = value.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%_]/g, "\\$&");
  return `raw_text.ilike."%${escaped}%",note.ilike."%${escaped}%"`;
}
export function matchesTransactionSearch(tx: { raw_text: string; note?: string | null }, value: string): boolean {
  const term = value.trim().toLocaleLowerCase();
  return tx.raw_text.toLocaleLowerCase().includes(term) || Boolean(tx.note?.toLocaleLowerCase().includes(term));
}
