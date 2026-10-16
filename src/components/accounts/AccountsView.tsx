import React, { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Plus,
  RefreshCw,
  Check,
} from "lucide-react";
import {
  ledgerService,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "../../services/ledgerService";
import { formatPaisa, parseInputToPaisa } from "../../lib/money";
import { AccountLedgerEntry, LedgerAccount } from "../../types/ledger";
import { useRegion } from "../../regional/region";
import { useI18n } from "../../i18n";

type AccountKind = LedgerAccount["type"];

export const AccountsView: React.FC = () => {
  const { region } = useRegion();
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [entries, setEntries] = useState<AccountLedgerEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [editingName, setEditingName] = useState("");

  // Create form state
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountKind>("CASH");
  const [openingAmount, setOpeningAmount] = useState("");

  // Transfer form state
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAccounts = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await ledgerService.getPaymentAccounts();
      setAccounts(result);
      setSelectedAccountId((current) =>
        result.some((account) => account.id === current) ? current : result[0]?.id || "",
      );
      return true;
    } catch (loadError) {
      console.error("Could not load accounts:", loadError);
      setError("Accounts could not be loaded. Please refresh and try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
    const handleOnline = () => {
      void loadAccounts();
    };
    const handleOfflineSyncComplete = (event: Event) => {
      const syncResult = (event as CustomEvent<{
        syncedCount: number;
        errors: unknown[];
      }>).detail;
      void loadAccounts().then((refreshed) => {
        if (syncResult.errors.length > 0) {
          setError("Some offline changes could not sync yet. They will retry when connection is available.");
        } else if (refreshed && syncResult.syncedCount > 0) {
          setMessage("Offline changes synced. Account balances refreshed.");
        }
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handleOfflineSyncComplete);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handleOfflineSyncComplete);
    };
  }, []);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  useEffect(() => {
    if (!selectedAccountId) {
      setEntries([]);
      return;
    }
    let isCancelled = false;
    setIsLoadingHistory(true);
    ledgerService
      .getAccountLedger(selectedAccountId)
      .then((history) => {
        if (!isCancelled) setEntries(history);
      })
      .catch((err) => {
        console.error("Could not load account ledger history:", err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingHistory(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [selectedAccountId]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!accountName.trim()) {
      setError("Account name is required.");
      return;
    }
    const parsed = openingAmount ? parseInputToPaisa(openingAmount) : { paisa: 0, isValid: true };
    if (!parsed.isValid) {
      setError("Enter a valid opening balance.");
      return;
    }
    try {
      await ledgerService.createPaymentAccount({
        name: accountName.trim(),
        type: accountType,
        openingBalancePaisa: parsed.paisa,
      });
      setAccountName("");
      setOpeningAmount("");
      setIsCreating(false);
      setMessage("Account created successfully.");
      await loadAccounts();
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : "Could not create account.");
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!sourceAccountId || !destinationAccountId) {
      setError("Please select both source and destination accounts.");
      return;
    }
    if (sourceAccountId === destinationAccountId) {
      setError("Source and destination accounts must be different.");
      return;
    }
    const parsed = parseInputToPaisa(transferAmount);
    if (!parsed.isValid || parsed.paisa <= 0) {
      setError("Transfer amount must be greater than zero.");
      return;
    }

    try {
      await ledgerService.transferBetweenAccounts({
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        amountPaisa: parsed.paisa,
        notes: "Treasury transfer",
      });
      setTransferAmount("");
      setIsTransferring(false);
      setMessage("Funds transferred successfully.");
      await loadAccounts();
    } catch (transferErr) {
      setError(transferErr instanceof Error ? transferErr.message : "Transfer failed.");
    }
  };

  const handleSaveName = async (accountId: string) => {
    if (!editingName.trim()) return;
    try {
      const isQueuedOffline = await ledgerService.updatePaymentAccount(accountId, {
        name: editingName.trim(),
      });
      setEditingAccountId("");
      setEditingName("");
      setMessage(isQueuedOffline ? "Account change saved offline. It will sync when you reconnect." : "Account name updated.");
      await loadAccounts();
    } catch (updateError) {
      console.error("Could not update account name:", updateError);
      setError("Could not update account name.");
    }
  };

  const activeAccounts = accounts.filter((account) => account.is_active);
  const canDeactivate = (account: LedgerAccount) =>
    account.balance_paisa === 0 && activeAccounts.length > 1;

  const handleDeactivate = async (account: LedgerAccount) => {
    if (account.is_active && !canDeactivate(account)) return setError("Move the balance and keep at least one active account.");
    setError("");
    setMessage("");
    try {
      const isQueuedOffline = await ledgerService.updatePaymentAccount(account.id, {
        is_active: !account.is_active,
      });
      setMessage(isQueuedOffline ? "Account change saved offline. It will sync when you reconnect." : account.is_active ? "Account deactivated." : "Account reactivated.");
      await loadAccounts();
    } catch (updateError) {
      console.error("Could not change account status:", updateError);
      setError("Account status could not be changed. Please try again.");
    }
  };

  const totalBalancePaisa = accounts.reduce((sum, account) => sum + (account.is_active ? Number(account.balance_paisa) || 0 : 0), 0);

  return (
    <main className="page-content accounts-page">
      {/* Page Title */}
      <div className="page-title">
        <div>
          <span className="kicker">TREASURY & BALANCES</span>
          <h1>Accounts</h1>
          <p>Manage payment methods, cash drawers, and bank liquidity.</p>
        </div>

        <div className="title-actions">
          <div className="balance-total">
            <small>TOTAL LIQUIDITY</small>
            <strong>{formatPaisa(totalBalancePaisa)}</strong>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setSourceAccountId(activeAccounts[0]?.id || "");
              setDestinationAccountId(activeAccounts[1]?.id || "");
              setIsTransferring(true);
            }}
            disabled={activeAccounts.length < 2}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Transfer
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={() => void loadAccounts()}
            title="Refresh"
            aria-label="Refresh accounts"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {message && (
        <div className="toast-note">
          <Check className="h-4 w-4" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          <span>{error}</span>
        </div>
      )}

      {/* Account Grid */}
      <div className="account-grid">
        {isLoading && accounts.length === 0 && (
          <div className="empty-state" role="status">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p>Loading accounts...</p>
          </div>
        )}
        {!isLoading && accounts.length === 0 && (
          <div className="empty-state">
            <strong>{error ? "Accounts are unavailable" : "No accounts yet"}</strong>
            <p>{error || "Add an account to start tracking money."}</p>
          </div>
        )}
        {accounts.map((acc) => {
          const initials = acc.type === "CASH" ? "CA" : acc.type === "BANK" ? "BA" : "DW";
          const isSelected = acc.id === selectedAccountId;

          return (
            <div
              className={`account-card ${isSelected ? "selected" : ""}`}
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              style={{ cursor: "pointer" }}
            >
              <div className="account-top">
                <span>{initials}</span>
                {editingAccountId === acc.id ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSaveName(acc.id);
                    }}
                    style={{ fontSize: 10, fontWeight: 700, color: "var(--green)" }}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAccountId(acc.id);
                      setEditingName(acc.name);
                    }}
                    style={{ fontSize: 10 }}
                  >
                    Edit
                  </button>
                )}
              </div>

              <small>{acc.type}</small>

              {editingAccountId === acc.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    margin: "4px 0 10px",
                    width: "100%",
                    padding: "4px 6px",
                    border: "1px solid var(--accent-line)",
                    borderRadius: 6,
                  }}
                />
              ) : (
                <h2>{acc.name}</h2>
              )}

              <strong className="metric-amount">
                {formatPaisa(acc.balance_paisa)}
              </strong>

              <p>
                <span
                  className="status-dot"
                  style={{ opacity: acc.is_active ? 1 : 0.45 }}
                />
                {acc.is_active
                  ? acc.is_default
                    ? "Default primary drawer"
                    : "Active ledger account"
                  : "Inactive account"}
              </p>
              <button
                type="button"
                className="button button-ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDeactivate(acc);
                }}
                disabled={acc.is_active && !canDeactivate(acc)}
                title={
                  acc.is_active && !canDeactivate(acc)
                    ? "Move the balance and keep at least one active account"
                    : undefined
                }
              >
                {acc.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected Account History Table */}
      {selectedAccount && (
        <section className="panel transaction-table">
          <div className="panel-heading" style={{ padding: "16px 20px 0" }}>
            <div>
              <h2>{selectedAccount.name} Activity History</h2>
              <p>Chronological postings and balance tracking</p>
            </div>
          </div>

          <div className="table-head">
            <span>Date & Time</span>
            <span>Posting Type</span>
            <span>Direction</span>
            <span style={{ textAlign: "right" }}>Amount</span>
            <span style={{ textAlign: "right" }}>Balance After</span>
          </div>

          {entries.map((entry) => {
            const isCredit = entry.entry_type === "credit";
            return (
              <div className="table-row" key={entry.id}>
                <span>{entry.business_date || entry.created_at.slice(0, 10)}</span>
                <strong>{entry.entry_type.toUpperCase()}</strong>
                <span>
                  <span className={`status-badge ${isCredit ? "" : "voided"}`}>
                    {isCredit ? "Inflow" : "Outflow"}
                  </span>
                </span>
                <strong className={isCredit ? "positive" : ""}>
                  {isCredit ? "+" : "−"}
                  {formatPaisa(entry.amount_paisa)}
                </strong>
                <span style={{ fontFamily: "DM Mono", textAlign: "right" }}>
                  {formatPaisa(entry.balance_after_paisa)}
                </span>
              </div>
            );
          })}

          {entries.length === 0 && !isLoadingHistory && (
            <div className="empty-state">
              <strong>No postings recorded</strong>
              <p>This account does not have recorded transactions yet.</p>
            </div>
          )}

          {isLoadingHistory && (
            <div className="empty-state">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <p>Loading account history...</p>
            </div>
          )}
        </section>
      )}

      {/* Create Account Modal */}
      {isCreating && (
        <div className="modal-backdrop" onClick={() => setIsCreating(false)}>
          <div className="expense-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Add Account</h2>
                <p>Create a new cash drawer, digital wallet, or bank account.</p>
              </div>
              <button type="button" onClick={() => setIsCreating(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreateAccount}>
              <div className="form-grid">
                <label className="full">
                  Account Name
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Counter Cash, Meezan Bank"
                  />
                </label>

                <label>
                  Account Type
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as AccountKind)}
                  >
                    <option value="CASH">Cash in Drawer</option>
                    <option value="BANK">Bank Account</option>
                    <option value="DIGITAL_WALLET">Digital Wallet (JazzCash / EasyPaisa)</option>
                  </select>
                </label>

                <label>
                  Opening Balance
                  <input
                    type="text"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Funds Modal */}
      {isTransferring && (
        <div className="modal-backdrop" onClick={() => setIsTransferring(false)}>
          <div className="expense-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Transfer Funds</h2>
                <p>Move money between drawers and bank accounts.</p>
              </div>
              <button type="button" onClick={() => setIsTransferring(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleTransfer}>
              <div className="form-grid">
                <label>
                  From Account
                  <select
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatPaisa(a.balance_paisa)})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  To Account
                  <select
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatPaisa(a.balance_paisa)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="full">
                  Transfer Amount
                  <input
                    type="text"
                    required
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="Amount to move (e.g. 5000)"
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setIsTransferring(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Transfer Funds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
