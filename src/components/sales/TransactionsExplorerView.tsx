import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { Select } from "../common/Select";
import { ledgerService } from "../../services/ledgerService";
import { SupabaseSessionRequiredError } from "../../lib/supabase";
import { Transaction, Category } from "../../types/ledger";
import { DataTable } from "../tables/DataTable";
import { transactionColumns } from "../tables/transactionColumns";
import { DatePicker } from "../common/DatePicker";
import { useRegion } from "../../regional/region";
import { useI18n } from "../../i18n";
import { getKarachiBusinessDate } from "../../lib/dates";
import { exportToCSV as downloadCSV } from "../../lib/utils";
import {
  Download,
  Search,
} from "lucide-react";
import { VoidModal } from "../chat/VoidModal";
import { TransactionDetailModal } from "../common/TransactionDetailModal";

export const TransactionsExplorerView: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user?.role, "VOID_EXPENSE");
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
  const requestId = useRef(0);
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
    const request = ++requestId.current;
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

      if (request !== requestId.current) return;
      setTransactions(res.transactions);
      setTotalCount(res.count);
    } catch (err) {
      if (request !== requestId.current) return;
      console.error("Error fetching transactions:", err);
      setTransactions([]);
      setTotalCount(0);
      setLoadError(
        err instanceof SupabaseSessionRequiredError
          ? err.message
          : "Transactions could not be loaded. Please refresh and try again.",
      );
    } finally {
      if (request === requestId.current) setIsLoading(false);
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

  const columns = useMemo(() => transactionColumns(setSelectedDetailTx, canManage ? setVoidingTx : undefined, t("transactions.account")), [t, canManage]);

  return (
    <main className="page-content entries-page">
      {/* Page Title */}
      <div className="page-title">
        <div className="entries-page-heading">
          <h1>Entries</h1><p className="sp-page-subtitle">Find and manage your recorded activity.</p>
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
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, payee, or note..."
            aria-label="Search entries"
          />
        </form>

        <DatePicker value={startDate} onChange={v => { setStartDate(v); setPage(0); }} ariaLabel="Entries start date" max={endDate || undefined} />
        <DatePicker value={endDate} onChange={v => { setEndDate(v); setPage(0); }} ariaLabel="Entries end date" min={startDate || undefined} />
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
          style={{ minHeight: 38, padding: "0 10px" }}
        >
          Reset
        </button>
      </section>

      <section className="panel"><DataTable data={transactions} columns={columns} label="Entries" loading={isLoading} error={loadError} onRetry={() => void loadData()} getRowId={tx => tx.id}
        server={{ total: totalCount, pagination: { pageIndex: page, pageSize }, onChange: updater => setPage(current => (typeof updater === "function" ? updater({ pageIndex: current, pageSize }) : updater).pageIndex) }} /></section>

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
    </main>
  );
};
