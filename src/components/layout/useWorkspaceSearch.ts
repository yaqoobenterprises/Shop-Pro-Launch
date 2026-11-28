import { useEffect, useState } from "react";
import { ledgerService } from "../../services/ledgerService";
import type { Transaction } from "../../types/ledger";
/** Queries the existing organization-scoped service; stale results never replace a newer query. */
export function useWorkspaceSearch(query: string, open: boolean) {
  const [state, setState] = useState<{ query: string; rows: Transaction[]; error?: string }>({ query: "", rows: [] });
  const search = query.trim();
  useEffect(() => {
    if (!open || search.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void ledgerService.getFilteredTransactions({ searchQuery: search, status: "all", limit: 6, offset: 0 }).then(result => {
        if (active) setState({ query: search, rows: result.transactions });
      }).catch(() => { if (active) setState({ query: search, rows: [], error: "Entries could not be searched. Try again in Entries." }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, open]);
  return search.length < 2 || !open ? { rows: [], loading: false, error: undefined } : { rows: state.query === search ? state.rows : [], loading: state.query !== search, error: state.query === search ? state.error : undefined };
}
