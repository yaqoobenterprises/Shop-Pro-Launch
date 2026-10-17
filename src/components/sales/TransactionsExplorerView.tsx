import React, { useCallback, useState, useEffect } from "react";
import { Select } from "../common/Select";
import { ledgerService } from "../../services/ledgerService";
import { Transaction, Category } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { useRegion } from "../../regional/region";
import { useI18n } from "../../i18n";
import { formatKarachiTime, getKarachiBusinessDate } from "../../lib/dates";
import { exportToCSV as downloadCSV } from "../../lib/utils";
import {
  Download,
  RefreshCw,
  Eye,
  Ban,
} from "lucide-react";
import { VoidModal } from "../chat/VoidModal";
import { TransactionDetailModal } from "../common/TransactionDetailModal";

const getTransactionDisplayDetails = (transaction: Transaction) => {
  const testDataMatch = transaction.raw_text.match(
    /^SHOP_PRO_PAGINATION_TEST \| (income|expense) \| (\d{4})$/,
  );
  if (!testDataMatch) {
    return {
      isTestData: false,
      rawText: transaction.raw_text,
      note: transaction.note,
    };
  }

  return {
    isTestData: true,
    rawText: `Pagination test entry #${testDataMatch[2]}`,
    note: "Generated test data",
  };
};

export const TransactionsExplorerView: React.FC = () => {
  const { region } = useRegion();
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<"active" | "voided" | "all">("all");

  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [voidingTx, setVoidingTx] = useState<Transaction | null>(null);
  const [selectedDetailTx, setSelectedDetailTx] = useState<Transaction | null>(null);

  const getCurrentFilter = useCallback(() => ({
    searchQuery: searchQuery.trim() || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    type: selectedType,
    categoryId: selectedCategory,
    status: selectedStatus,
  }), [searchQuery, startDate, endDate, selectedType, selectedCategory, selectedStatus]);

  const loadData = useCallback(async (requestedPage = page) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const cats = await ledgerService.getCategories();
      setCategories(cats);

      const res = await ledgerService.getFilteredTransactions({
        ...getCurrentFilter(),
        limit: pageSize,
        offset: requestedPage * pageSize,
      });

      setTransactions(res.transactions);
      setTotalCount(res.count);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setTransactions([]);
      setTotalCount(0);
      setLoadError("Transactions could not be loaded. Please refresh and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, getCurrentFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    void loadData(0);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    setExportError("");
    const headers = [
      "ID",
      "Business Date",
      "Device Time",
      "Type",
      "Category",
      t("currency.amountLabel", { currency: region.currency }),
      "Raw Text",
      "Status",
      "Void Reason",
      "Created By",
    ];
    try {
      const exportedTransactions = await ledgerService.getAllFilteredTransactions(
        getCurrentFilter(),
      );
      if (exportedTransactions.length === 0) return;
      const rows = exportedTransactions.map((tx) => [
        tx.id,
        tx.business_date,
        tx.device_entry_time,
        tx.type,
        tx.category_name || "",
        (tx.amount_paisa / 100).toFixed(2),
        tx.raw_text,
        tx.status,
        tx.void_reason || "",
        tx.created_by_name || "",
      ]);
      downloadCSV(
        "shop_pro_ledger_export",
        headers,
        rows,
        getKarachiBusinessDate(),
      );
    } catch (err) {
      console.error("Error exporting transactions:", err);
      setExportError("The CSV export could not be completed. Please retry.");
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <main className="page-content entries-page">
      {/* Page Title */}
      <div className="page-title">
        <div>
          <h1>Entries</h1>
        </div>

        <div className="title-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleExportCSV}
            disabled={isExporting || totalCount === 0}
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => void loadData()}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          {exportError}
        </div>
      )}

      {loadError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          {loadError}
        </div>
      )}

      {/* Filter Panel */}
      <section className="panel filter-panel">
        <form onSubmit={handleSearchSubmit} className="search-field">
          <span>⌕</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, payee, or note..."
            aria-label="Search entries"
          />
        </form>

        <Select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by type"
        >
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="capital_in">Capital Introduced</option>
          <option value="withdrawal">Owner Drawings</option>
          <option value="adjustment">Cash Adjustments</option>
        </Select>

        <Select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.kind})
            </option>
          ))}
        </Select>

        <Select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value as "active" | "voided" | "all");
            setPage(0);
          }}
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="voided">Voided Only</option>
        </Select>

        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            setSelectedType("all");
            setSelectedCategory("all");
            setSelectedStatus("all");
            setStartDate("");
            setEndDate("");
            setPage(0);
          }}
          className="button button-ghost"
          style={{ minHeight: 38, padding: "0 10px", fontSize: 11 }}
        >
          Reset
        </button>
      </section>

      {/* Transactions Table */}
      <section className="panel transaction-table">
        <div className="table-head">
          <span>Transaction / Description</span>
          <span>{t("transactions.account")}</span>
          <span>Date & Time</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span>Status & Action</span>
        </div>

        {transactions.map((tx) => {
          const isIncome =
            tx.type === "income" ||
            tx.type === "capital_in" ||
            (tx.type === "adjustment" && tx.adjustment_dir === "in");
          const isVoid = tx.status === "voided";
          const details = getTransactionDisplayDetails(tx);
          const initials = (tx.category_name || tx.type || "TX")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div className="table-row" key={tx.id}>
              <div>
                <span className="transaction-icon">{initials}</span>
                <div>
                  <strong>{details.rawText}</strong>
                  <small>
                    {tx.category_name || "Uncategorized"} {details.note ? ` · ${details.note}` : ""}
                  </small>
                  {details.isTestData && <small className="status-badge">Test data</small>}
                </div>
              </div>

              <span>{tx.account_name || "Cash"}</span>

              <span>
                {tx.business_date} · <small>{formatKarachiTime(tx.created_at)}</small>
              </span>

              <strong className={isIncome && !isVoid ? "positive" : ""}>
                {isIncome ? "+" : "−"}
                {formatPaisa(tx.amount_paisa)}
              </strong>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`status-badge ${isVoid ? "voided" : ""}`}>
                  {isVoid ? "Voided" : "Active"}
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedDetailTx(tx)}
                  className="icon-button"
                  style={{ width: 28, height: 28 }}
                  title="View details"
                  aria-label="View transaction details"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>

                {!isVoid && (
                  <button
                    type="button"
                    onClick={() => setVoidingTx(tx)}
                    className="icon-button"
                    style={{ width: 28, height: 28, color: "var(--danger)" }}
                    title="Void transaction"
                    aria-label="Void transaction"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && !isLoading && (
          <div className="empty-state">
            <strong>No transactions found</strong>
            <p>Try adjusting your search criteria or filters.</p>
          </div>
        )}

        {isLoading && (
          <div className="empty-state">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p>Loading transactions...</p>
          </div>
        )}

        <div className="table-footer">
          <span>
            Showing {transactions.length} of {totalCount} transactions
          </span>
          <div>
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ←
            </button>
            <strong>
              {page + 1} / {Math.max(1, totalPages)}
            </strong>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </button>
          </div>
        </div>
      </section>

      {/* Real modals preserved */}
      {voidingTx && (
        <VoidModal
          transaction={voidingTx}
          onConfirmVoid={async (id, reason, currentUpdatedAt) => {
            await ledgerService.voidTransaction(id, reason, currentUpdatedAt);
            setVoidingTx(null);
            void loadData();
          }}
          onClose={() => setVoidingTx(null)}
        />
      )}

      <TransactionDetailModal
        transaction={selectedDetailTx}
        isOpen={Boolean(selectedDetailTx)}
        onClose={() => setSelectedDetailTx(null)}
        canManage={true}
        onVoid={(tx) => {
          setSelectedDetailTx(null);
          setVoidingTx(tx);
        }}
      />
    </main>
  );
};
