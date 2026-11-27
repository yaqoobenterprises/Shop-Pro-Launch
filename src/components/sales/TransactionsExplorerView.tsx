import React, { useCallback, useState, useEffect, useRef } from "react";
import { Select } from "../common/Select";
import { ledgerService } from "../../services/ledgerService";
import { SupabaseSessionRequiredError } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { hasPermission } from "../../lib/permissions";
import "./TransactionsWorkspace.css";
import { Transaction, Category, LedgerAccount } from "../../types/ledger";
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
  Search,
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
  const { user, isDemoMode, isCloudAccount } = useAuth();
  const { startNewEntry } = useApp();
  const canManage = !isDemoMode && hasPermission(user?.role, "VOID_EXPENSE");
  const requestId = useRef(0);
  const exportLock = useRef(false);
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);
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
    searchQuery: appliedSearch.trim() || undefined,
    accountId: selectedAccount,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    type: selectedType,
    categoryId: selectedCategory,
    status: selectedStatus,
  }), [appliedSearch, selectedAccount, startDate, endDate, selectedType, selectedCategory, selectedStatus]);

  const loadData = useCallback(async (requestedPage = page) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadError("");
    setTransactions([]);
    setTotalCount(0);
    if (invalidDateRange) { setIsLoading(false); return; }
    try {
      const [cats, paymentAccounts] = await Promise.all([ledgerService.getCategories(), ledgerService.getPaymentAccounts()]);
      if (id !== requestId.current) return;
      setCategories(cats);
      setAccounts(paymentAccounts);

      const res = await ledgerService.getFilteredTransactions({
        ...getCurrentFilter(),
        limit: pageSize,
        offset: requestedPage * pageSize,
      }, { requireCloudSource: isCloudAccount && !isDemoMode });
      if (id !== requestId.current) return;

      setTransactions(res.transactions);
      setTotalCount(res.count);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error("Error fetching transactions:", err);
      setTransactions([]);
      setTotalCount(0);
      setLoadError(
        err instanceof SupabaseSessionRequiredError
          ? err.message
          : "Transactions could not be loaded. Please refresh and try again.",
      );
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [page, getCurrentFilter, invalidDateRange, isCloudAccount, isDemoMode]);

  useEffect(() => {
    void loadData();
    return () => { requestId.current += 1; };
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    if (appliedSearch === searchQuery.trim() && page === 0) void loadData(0);
    else setAppliedSearch(searchQuery.trim());
  };

  const handleExportCSV = async () => {
    if (exportLock.current || invalidDateRange || isLoading || loadError) return;
    exportLock.current = true;
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
        { requireCloudSource: isCloudAccount && !isDemoMode },
      );
      if (exportedTransactions.length === 0) { setExportError("No matching transactions to export."); return; }
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
        "shop_plus_transactions",
        headers,
        rows,
        getKarachiBusinessDate(),
      );
    } catch (err) {
      console.error("Error exporting transactions:", err);
      setExportError("The CSV export could not be completed. Please retry.");
    } finally {
      exportLock.current = false;
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="page-content entries-page shop-plus-transactions">
      {/* Page Title */}
      <div className="page-title">
        <div className="entries-page-heading">
          <h1>Transactions</h1>
          <p>Review recorded activity and export the complete filtered result.</p>
        </div>

        <div className="title-actions">
          <button type="button" className="button button-primary" onClick={startNewEntry}>New entry</button>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleExportCSV}
            disabled={isExporting || isLoading || Boolean(loadError) || invalidDateRange || totalCount === 0 || searchQuery.trim() !== appliedSearch}
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export filtered CSV"}
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
          {loadError} <button type="button" onClick={() => void loadData()}>Retry</button>
        </div>
      )}

      {/* Filter Panel */}
      <section className="panel filter-panel">
        <form onSubmit={handleSearchSubmit} className="search-field">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recorded description..."
            aria-label="Search transactions"
          />
          <button type="submit" className="button button-secondary">Search</button>
        </form>
        <label className="transaction-date-filter">From<input type="date" aria-label="From business date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }} /></label>
        <label className="transaction-date-filter">To<input type="date" aria-label="To business date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }} /></label>
        <Select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); setPage(0); }} aria-label="Filter by account">
          <option value="all">All accounts</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </Select>

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
            setAppliedSearch("");
            setSelectedAccount("all");
            setSelectedType("all");
            setSelectedCategory("all");
            setSelectedStatus("all");
            setStartDate("");
            setEndDate("");
            setPage(0);
          }}
          className="button button-ghost"
          style={{ minHeight: 38, padding: "0 10px" }}
        >
          Reset
        </button>
      </section>

      {invalidDateRange && <p role="alert" className="text-sm text-danger">From date must be on or before To date.</p>}
      {(!isCloudAccount || isDemoMode) && <p className="text-xs text-text-muted">{isDemoMode ? "Demo records only." : "Local records may be incomplete; cloud history is not verified."}</p>}
      {searchQuery.trim() !== appliedSearch && <p className="text-xs text-text-muted">Press Search to apply the typed description.</p>}
      {/* Transactions Table */}
      <section className="panel transaction-table" aria-label="Transaction results">
        <div className="table-head" aria-hidden="true">
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


          return (
            <div className="table-row" key={tx.id}>
              <div>
                <div>
                  <strong>{details.rawText}</strong>
                  <small>
                    {tx.category_name || "Uncategorized"} {details.note ? ` · ${details.note}` : ""}
                  </small>
                  {details.isTestData && <small className="status-badge">Test data</small>}
                </div>
              </div>

              <span className="transaction-account">{tx.account_name || "Account unavailable"}</span>

              <span>
                {tx.business_date} · <small>{formatKarachiTime(tx.created_at)}</small>
              </span>

              <strong className={`transaction-amount num ${isIncome && !isVoid ? "positive" : ""}`}>
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
                  style={{ width: 44, height: 44 }}
                  title="View details"
                  aria-label="View transaction details"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>

                {!isVoid && canManage && (
                  <button
                    type="button"
                    onClick={() => setVoidingTx(tx)}
                    className="icon-button"
                    style={{ width: 44, height: 44, color: "var(--danger)" }}
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

        {transactions.length === 0 && !isLoading && !loadError && !invalidDateRange && (
          <div className="empty-state">
            <strong>No transactions found</strong>
            <p>Try adjusting your search criteria or filters.</p>
          </div>
        )}

        {isLoading && (
          <div className="empty-state" role="status">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p>Loading transactions...</p>
          </div>
        )}

        <div className="table-footer">
          <span>
            {isLoading ? "Loading…" : loadError || invalidDateRange ? "Results unavailable" : `${totalCount === 0 ? 0 : page * pageSize + 1}–${page * pageSize + transactions.length} of ${totalCount} transactions`}
          </span>
          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={isLoading || page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ←
            </button>
            <strong>
              {page + 1} / {Math.max(1, totalPages)}
            </strong>
            <button
              type="button"
              aria-label="Next page"
              disabled={isLoading || page + 1 >= totalPages}
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
        canManage={canManage}
        onVoid={(tx) => {
          setSelectedDetailTx(null);
          setVoidingTx(tx);
        }}
      />
    </div>
  );
};
