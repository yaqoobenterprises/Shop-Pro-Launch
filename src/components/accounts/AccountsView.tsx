import React, { useCallback, useEffect, useState } from "react";
import { Select } from "../common/Select";
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
import { LedgerAccount } from "../../types/ledger";

type AccountKind = LedgerAccount["type"];

export const AccountsView: React.FC = () => {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await ledgerService.getPaymentAccounts();
      setAccounts(result);
      const activeResult = result.filter((account) => account.is_active);
      const nextSourceId = activeResult.some((account) => account.id === sourceAccountId)
        ? sourceAccountId
        : activeResult[0]?.id || "";
      setSourceAccountId(nextSourceId);
      setDestinationAccountId((current) =>
        activeResult.some((account) => account.id === current && account.id !== nextSourceId)
          ? current
          : activeResult.find((account) => account.id !== nextSourceId)?.id || "",
      );
      return true;
    } catch (loadError) {
      console.error("Could not load accounts:", loadError);
      setError("Accounts could not be loaded. Please refresh and try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [sourceAccountId]);

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
  }, [loadAccounts]);

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
          <h1>Accounts</h1>
        </div>

        <div className="title-actions">
          <div className="balance-total">
            <small>TOTAL LIQUIDITY</small>
            <strong>{formatPaisa(totalBalancePaisa)}</strong>
          </div>

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
          return (
            <div
              className="account-card"
              key={acc.id}
            >
              <div className="account-top">
                <span>{initials}</span>
                {editingAccountId === acc.id ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveName(acc.id)}
                    style={{ fontSize: 10, fontWeight: 700, color: "var(--green)" }}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
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
                className="button button-ghost account-status-action"
                onClick={() => void handleDeactivate(acc)}
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

      <div className="account-tools">
        <section className="panel account-tool-panel">
          <div className="panel-heading account-tool-heading">
            <span className="account-tool-icon" aria-hidden="true">
              <Plus className="h-4 w-4" />
            </span>
            <h2>Add an account</h2>
          </div>

          <form onSubmit={handleCreateAccount}>
            <div className="form-grid">
              <label className="full">
                Account name
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Counter Cash, Meezan Bank"
                />
              </label>

              <label>
                Account type
                <Select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountKind)}
                >
                  <option value="CASH">Cash in Drawer</option>
                  <option value="BANK">Bank Account</option>
                  <option value="DIGITAL_WALLET">Digital Wallet (JazzCash / EasyPaisa)</option>
                </Select>
              </label>

              <label>
                Opening balance
                <input
                  type="text"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="submit" className="button button-primary account-tool-submit" disabled={isLoading}>
                Add account
              </button>
            </div>
          </form>
        </section>

        <section className="panel account-tool-panel">
          <div className="panel-heading account-tool-heading">
            <span className="account-tool-icon" aria-hidden="true">
              <ArrowLeftRight className="h-4 w-4" />
            </span>
            <h2>Transfer funds</h2>
          </div>

          <form onSubmit={handleTransfer}>
            <div className="form-grid">
              <label>
                From
                <Select
                  required
                  value={sourceAccountId}
                  onChange={(e) => {
                    const nextSourceId = e.target.value;
                    setSourceAccountId(nextSourceId);
                    setDestinationAccountId((current) =>
                      current === nextSourceId
                        ? activeAccounts.find((account) => account.id !== nextSourceId)?.id || ""
                        : current,
                    );
                  }}
                >
                  <option value="">Select account</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {formatPaisa(account.balance_paisa)}
                    </option>
                  ))}
                </Select>
              </label>

              <label>
                To
                <Select
                  required
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                >
                  <option value="">Select account</option>
                  {activeAccounts
                    .filter((account) => account.id !== sourceAccountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {formatPaisa(account.balance_paisa)}
                      </option>
                    ))}
                </Select>
              </label>

              <label className="full">
                Amount
                <input
                  type="text"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                type="submit"
                className="button button-primary account-tool-submit"
                disabled={isLoading || activeAccounts.length < 2}
              >
                <ArrowLeftRight className="h-4 w-4" />
                Transfer funds
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};
