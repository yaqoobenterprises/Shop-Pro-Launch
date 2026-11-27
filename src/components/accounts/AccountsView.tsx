import React, { useCallback, useEffect, useState, useRef } from "react";
import { Select } from "../common/Select";
import {
  ArrowLeftRight,
  Banknote,
  Landmark,
  Plus,
  RefreshCw,
  Check,
  Pencil,
  Power,
  WalletCards,
} from "lucide-react";
import {
  ledgerService,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "../../services/ledgerService";
import { formatPaisa, parseInputToPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import "./AccountsPoitalFinish.css";
import "./AccountInsights.css";
import { PaymentAccountInsights } from "./PaymentAccountInsights";
import { LedgerAccount } from "../../types/ledger";
import {
  findAccountProvider,
  PAKISTAN_ACCOUNT_PROVIDERS,
} from "../../lib/accountProviders";

type AccountKind = LedgerAccount["type"];

export const AccountsView: React.FC<{ canManage?: boolean; canTransfer?: boolean; demo?: boolean; onExplore?: (accountId: string) => void }> = ({ canManage = true, canTransfer = true, demo = false, onExplore }) => {
  const mutationLock = useRef(false);
  const requestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [activeTool, setActiveTool] = useState<"add" | "transfer" | null>(null);

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
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const result = await ledgerService.getPaymentAccounts();
      if (id !== requestId.current) return false;
      setAccounts(result);
      const activeResult = result.filter((account) => account.is_active);
      const nextSourceId = activeResult[0]?.id || "";
      setSourceAccountId(current => activeResult.some(account => account.id === current) ? current : nextSourceId);
      setDestinationAccountId(current => activeResult.some(account => account.id === current) ? current : activeResult.find(account => account.id !== nextSourceId)?.id || "");
      return true;
    } catch (loadError) {
      if (id !== requestId.current) return false;
      setLoadFailed(true);
      console.error("Could not load accounts:", loadError);
      setError("Accounts could not be loaded. Please refresh and try again.");
      return false;
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

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
      requestId.current += 1;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handleOfflineSyncComplete);
    };
  }, [loadAccounts]);

  const beginMutation = () => { if (mutationLock.current) return false; mutationLock.current = true; setBusy(true); return true; };
  const endMutation = () => { mutationLock.current = false; setBusy(false); };
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationLock.current) return;
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
      if (!canManage || !beginMutation()) return;
      const result = await ledgerService.createPaymentAccount({
        name: accountName.trim(),
        type: accountType,
        openingBalancePaisa: parsed.paisa,
      });
      setAccountName("");
      setOpeningAmount("");
      setMessage(result.isQueuedOffline ? (demo ? "Demo account saved locally." : "Account creation queued for synchronization.") : "Account created.");
      await loadAccounts();
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : "Could not create account.");
    } finally { endMutation(); }
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
      if (!canTransfer || loadFailed || isLoading || !activeAccounts.some(a => a.id === sourceAccountId) || !activeAccounts.some(a => a.id === destinationAccountId) || !beginMutation()) return;
      const queued = await ledgerService.transferBetweenAccounts({
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        amountPaisa: parsed.paisa,
        notes: "Treasury transfer",
      });
      setTransferAmount("");
      setMessage(queued ? (demo ? "Demo transfer recorded locally; no real funds moved." : "Transfer queued. Balances are not confirmed until synchronization succeeds.") : "Transfer confirmed in the account ledger.");
      await loadAccounts();
    } catch (transferErr) {
      setError(transferErr instanceof Error ? transferErr.message : "Transfer failed.");
    } finally { endMutation(); }
  };

  const handleSaveName = async (accountId: string) => {
    if (!editingName.trim() || !canManage || !beginMutation()) return;
    setError(""); setMessage("");
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
    } finally { endMutation(); }
  };

  const activeAccounts = accounts.filter((account) => account.is_active);
  const canDeactivate = (account: LedgerAccount) =>
    account.balance_paisa === 0 && activeAccounts.length > 1;

  const handleDeactivate = async (account: LedgerAccount) => {
    if (!canManage || mutationLock.current || loadFailed || isLoading) return;
    if (account.is_active && !canDeactivate(account)) return setError("Move the balance and keep at least one active account.");
    setError("");
    setMessage("");
    try {
      if (!beginMutation()) return;
      const isQueuedOffline = await ledgerService.updatePaymentAccount(account.id, {
        is_active: !account.is_active,
      });
      setMessage(isQueuedOffline ? "Account change saved offline. It will sync when you reconnect." : account.is_active ? "Account deactivated." : "Account reactivated.");
      await loadAccounts();
    } catch (updateError) {
      console.error("Could not change account status:", updateError);
      setError("Account status could not be changed. Please try again.");
    } finally { endMutation(); }
  };

  const totalBalancePaisa = accounts.reduce((sum, account) => sum + (account.is_active ? Number(account.balance_paisa) || 0 : 0), 0);

  return (
    <div className="page-content accounts-page">
      {/* Page Title */}
      <div className="page-title">
        <div className="accounts-page-heading">
          <h1>Accounts</h1>
          <p>Manage recorded balances and internal money movement.</p>
        </div>

        <div className="title-actions">
          <div className="balance-total">
            <small>Total active recorded balance</small>
            <strong>
              <AnimatedAmount amountPaisa={totalBalancePaisa} loading={isLoading} error={loadFailed} />
            </strong>
          </div>

        </div>
      </div>

      {message && (
        <div className="toast-note" role="status">
          <Check className="h-4 w-4" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="toast-note" role="alert" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          <span>{error}</span>
        </div>
      )}

      <p className="account-scope-note">Available recorded balances may include local account changes; these are not verified bank statements. Transfers are internal movements, not income or expenses.</p>
      <div className="accounts-quick-actions" role="group" aria-label="Account management">
        <button type="button" disabled={!canManage || busy} aria-expanded={activeTool === "add"} aria-controls={activeTool === "add" ? "aq-account-create" : undefined}
          onClick={() => setActiveTool((current) => current === "add" ? null : "add")}>
          <Plus className="h-4 w-4" aria-hidden="true"/> New account
        </button>
        <button type="button" disabled={!canTransfer || busy || loadFailed || isLoading || activeAccounts.length < 2} aria-expanded={activeTool === "transfer"} aria-controls={activeTool === "transfer" ? "aq-account-transfer" : undefined}
          onClick={() => setActiveTool((current) => current === "transfer" ? null : "transfer")}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true"/> Move money
        </button>
      </div>
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
          const brand = findAccountProvider(acc.name);
          const accountMarkLabel = brand?.name
            ? `${brand.name} ${brand.logo ? "logo" : "brand mark"}`
            : acc.type === "CASH"
              ? "Cash account"
              : acc.type === "BANK"
                ? "Bank account"
                : "Digital wallet account";
          const accountMarkClass = brand
            ? brand.logo
              ? `account-brand--${brand.key}`
              : "account-brand--provider"
            : `account-brand--${acc.type.toLowerCase().replace("_", "-")}`;
          const isEditing = editingAccountId === acc.id;
          const deactivateBlocked = acc.is_active && !canDeactivate(acc);
          return (
            <div
              className="account-card"
              key={acc.id}
            >
              <div className="account-top">
                <div
                  className={`account-brand ${accountMarkClass}`}
                  role="img"
                  aria-label={accountMarkLabel}
                  style={brand && !brand.logo ? { "--account-brand-color": brand.color } as React.CSSProperties : undefined}
                >
                  {brand?.logo ? (
                    <img src={brand.logo} alt="" />
                  ) : brand ? (
                    <span className="account-brand-wordmark" aria-hidden="true">{brand.mark}</span>
                  ) : acc.type === "CASH" ? (
                    <Banknote aria-hidden="true" />
                  ) : acc.type === "BANK" ? (
                    <Landmark aria-hidden="true" />
                  ) : (
                    <WalletCards aria-hidden="true" />
                  )}
                </div>
                <div className="account-actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditing) {
                        void handleSaveName(acc.id);
                        return;
                      }
                      setEditingAccountId(acc.id);
                      setEditingName(acc.name);
                    }}
                    disabled={!canManage || busy || isLoading || loadFailed}
                    className="account-action-button account-edit-button"
                    aria-label={isEditing ? `Save ${acc.name}` : `Edit ${acc.name}`}
                    title={isEditing ? "Save account name" : "Edit account name"}
                  >
                    {isEditing ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={`account-action-button account-status-button${acc.is_active ? " is-deactivate" : " is-reactivate"}`}
                    onClick={() => void handleDeactivate(acc)}
                    disabled={deactivateBlocked || !canManage || busy || loadFailed || isLoading}
                    aria-label={`${acc.is_active ? "Deactivate" : "Reactivate"} ${acc.name}`}
                    title={
                      deactivateBlocked
                        ? "Move the balance and keep at least one active account"
                        : `${acc.is_active ? "Deactivate" : "Reactivate"} account`
                    }
                  >
                    <Power aria-hidden="true" />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <input
                  type="text"
                  aria-label={`Account name for ${acc.name}`}
                  disabled={busy}
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

              <span className="account-kind">{acc.type === "CASH" ? "Cash" : acc.type === "BANK" ? "Bank" : acc.type === "DIGITAL_WALLET" ? "Digital wallet" : "Other"}{acc.is_default ? " · Primary" : ""}{!acc.is_active ? " · Inactive" : ""}</span>
              <strong className="metric-amount">
                <AnimatedAmount amountPaisa={acc.balance_paisa} loading={isLoading} error={loadFailed} />
              </strong>
              {onExplore && <button type="button" className="account-history-link" onClick={() => onExplore(acc.id)}>View transactions</button>}
            </div>
          );
        })}
      </div>

      {!loadFailed && !isLoading && accounts.length > 0 &&
        <PaymentAccountInsights accounts={accounts} onRefresh={() => { void loadAccounts(); }} isRefreshing={isLoading} />}

      {activeTool && <div className="account-tools accounts-tools--focused">
        {activeTool === "add" && <section id="aq-account-create" className="panel account-tool-panel">
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
                  list="account-provider-suggestions"
                  placeholder="e.g. Counter Cash, Meezan Bank, HBL"
                />
                <datalist id="account-provider-suggestions">
                  {PAKISTAN_ACCOUNT_PROVIDERS.map((provider) => (
                    <option key={provider.key} value={provider.name} />
                  ))}
                </datalist>
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
                  inputMode="decimal"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="submit" className="button button-primary account-tool-submit" disabled={isLoading || busy || !canManage}>
                Add account
              </button>
            </div>
          </form>
        </section>}

        {activeTool === "transfer" && <section id="aq-account-transfer" className="panel account-tool-panel">
          <div className="panel-heading account-tool-heading">
            <span className="account-tool-icon" aria-hidden="true">
              <ArrowLeftRight className="h-4 w-4" />
            </span>
            <h2>Transfer funds</h2>
          </div>

          <p className="account-scope-note">Move recorded money between accounts. This does not initiate a bank payment.</p>
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
                  inputMode="decimal"
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
                disabled={isLoading || busy || loadFailed || !canTransfer || activeAccounts.length < 2 || sourceAccountId === destinationAccountId}
              >
                <ArrowLeftRight className="h-4 w-4" />
                {busy ? "Recording…" : "Transfer funds"}
              </button>
            </div>
          </form>
        </section>}
      </div>}
    </div>
  );
};
