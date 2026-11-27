import React, { useCallback, useEffect, useState, useRef } from "react";
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
import { formatRecordedPaisa as formatPaisa, parseInputToPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import "./AccountsPoitalFinish.css";
import "./AccountInsights.css";
import { AccountHistory } from "./AccountHistory";
import { AccountCards } from "./AccountCards";
import { PaymentAccountInsights } from "./PaymentAccountInsights";
import { LedgerAccount } from "../../types/ledger";
import {
  PAKISTAN_ACCOUNT_PROVIDERS,
} from "../../lib/accountProviders";

type AccountKind = LedgerAccount["type"];

export const AccountsView: React.FC<{ canManage?: boolean; canTransfer?: boolean; demo?: boolean; cloudOnly?: boolean; onExplore?: (accountId: string) => void }> = ({ canManage = true, canTransfer = true, demo = false, cloudOnly = false, onExplore }) => {
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
    setError(current => current === "Accounts could not be loaded. Please refresh and try again." ? "" : current);
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
    if (mutationLock.current) return;
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

  const exactBalance = activeAccounts.every(account => Number.isSafeInteger(account.balance_paisa)) ? activeAccounts.reduce((sum, account) => sum + BigInt(account.balance_paisa), 0n) : null;
  const totalBalancePaisa = exactBalance !== null && exactBalance <= BigInt(Number.MAX_SAFE_INTEGER) && exactBalance >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(exactBalance) : NaN;

  return (
    <div className="page-content accounts-page">
      {/* Page Title */}
      <div className="page-title">
        <div className="accounts-page-heading">
          <h1>Accounts</h1>
        </div>

        <div className="title-actions">
          <div className="balance-total">
            <small>Active balance</small>
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
        <button type="button" onClick={() => void loadAccounts()} disabled={isLoading || busy}>Refresh balances</button>
      </div>
      {activeTool && <div className="account-tools accounts-tools--focused">
        {activeTool === "add" && <section id="aq-account-create" className="panel account-tool-panel">
          <div className="panel-heading account-tool-heading">
            <span className="account-tool-icon" aria-hidden="true">
              <Plus className="h-4 w-4" />
            </span>
            <h2>Add account</h2>
          </div>

          <form onSubmit={handleCreateAccount}>
            <fieldset disabled={busy} className="form-grid">
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
            </fieldset>

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
            <fieldset disabled={busy} className="form-grid">
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
            </fieldset>

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
        <AccountCards accounts={accounts} editingAccountId={editingAccountId} editingName={editingName}
          setEditingAccountId={setEditingAccountId} setEditingName={setEditingName}
          handleSaveName={handleSaveName} handleDeactivate={handleDeactivate} canDeactivate={canDeactivate}
          canManage={canManage} busy={busy} isLoading={isLoading} loadFailed={loadFailed} onExplore={onExplore} />
      </div>

      {cloudOnly && <AccountHistory />}
      {!loadFailed && !isLoading && accounts.length > 0 &&
        <PaymentAccountInsights accounts={accounts} onRefresh={() => { void loadAccounts(); }} isRefreshing={isLoading} />}


    </div>
  );
};
