import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Ban } from "lucide-react";
import type { Transaction } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { formatKarachiTime } from "../../lib/dates";
const labels = { income: "Income", expense: "Expense", capital_in: "Capital", withdrawal: "Drawing", adjustment: "Adjustment" };
export function transactionColumns(onView?: (tx: Transaction) => void, onVoid?: (tx: Transaction) => void, accountLabel = "Account"): ColumnDef<Transaction>[] {
  const columns: ColumnDef<Transaction>[] = [
    { accessorKey: "raw_text", header: "Description", size: 300, cell: ({ row: { original: tx } }) => {
      const fixture = tx.raw_text.match(/^SHOP_PRO_PAGINATION_TEST \| (income|expense) \| (\d{4})$/);
      return <div className="sp-table-cell"><strong title={tx.raw_text}>{fixture ? `Pagination test entry #${fixture[2]}` : tx.raw_text || "—"}</strong><small>{tx.category_name || "Uncategorized"}{fixture ? " · Test data" : tx.note ? ` · ${tx.note}` : ""}</small></div>;
    } },
    { accessorKey: "business_date", header: "Date", size: 150, cell: ({ row: { original: tx } }) => <div className="sp-table-cell"><span>{tx.business_date}</span><small>{formatKarachiTime(tx.created_at)}</small></div> },
    { accessorKey: "type", header: "Type", size: 110, cell: ({ getValue }) => <span className={`reports-modern__type-badge type-${getValue()}`}>{labels[getValue() as keyof typeof labels]}</span> },
    { accessorKey: "account_name", header: accountLabel, size: 140, cell: ({ getValue }) => String(getValue() || "Cash") },
    { accessorKey: "amount_paisa", header: "Amount", size: 160, cell: ({ row: { original: tx } }) => {
      const incoming = tx.type === "income" || tx.type === "capital_in" || (tx.type === "adjustment" && tx.adjustment_dir === "in");
      return <strong className={`num ${tx.status === "voided" ? "line-through text-text-muted" : incoming ? "positive" : ""}`}>{incoming ? "+" : "−"}{formatPaisa(tx.amount_paisa, { showPaisaIfFraction: true })}</strong>;
    } },
    { accessorKey: "status", header: "Status", size: 100, cell: ({ getValue }) => <span className={`status-badge ${getValue() === "voided" ? "voided" : ""}`}>{getValue() === "voided" ? "Voided" : "Active"}</span> },
  ];
  if (onView || onVoid) columns.push({ id: "actions", header: "Actions", size: 100, enableHiding: false, enableSorting: false, enableResizing: false, cell: ({ row: { original: tx } }) => <div className="sp-table-actions">{onView && <button type="button" className="icon-button" aria-label="View transaction details" onClick={() => onView(tx)}><Eye size={16} /></button>}{onVoid && tx.status !== "voided" && <button type="button" className="icon-button" aria-label="Void transaction" onClick={() => onVoid(tx)}><Ban size={16} /></button>}</div> });
  return columns;
}
