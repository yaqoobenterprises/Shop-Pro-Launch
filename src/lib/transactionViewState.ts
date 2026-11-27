import type { TransactionSort } from "./transactionFilters";

/** In-memory view preferences only. Never persist transaction search text to browser storage. */
export interface TransactionViewState {
  searchQuery: string;
  appliedSearch: string;
  account: string;
  startDate: string;
  endDate: string;
  type: string;
  category: string;
  status: "active" | "voided" | "all";
  page: number;
  minimum?: string;
  maximum?: string;
  sort?: TransactionSort;
}
export const emptyTransactionView = (): TransactionViewState => ({
  searchQuery: "", appliedSearch: "", account: "all", startDate: "", endDate: "",
  type: "all", category: "all", status: "all", page: 0,
});
