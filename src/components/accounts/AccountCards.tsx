import React from "react";
import { Banknote, Landmark, Check, Pencil, Power, WalletCards } from "lucide-react";
import { AnimatedAmount } from "../common/AnimatedAmount";
import type { LedgerAccount } from "../../types/ledger";
import { findAccountProvider } from "../../lib/accountProviders";

interface Props {
 accounts: LedgerAccount[];
 editingAccountId: string; editingName: string;
 setEditingAccountId: (id: string) => void; setEditingName: (name: string) => void;
 handleSaveName: (id: string) => Promise<void>; handleDeactivate: (account: LedgerAccount) => Promise<void>;
 canDeactivate: (account: LedgerAccount) => boolean;
 canManage: boolean; busy: boolean; isLoading: boolean; loadFailed: boolean;
 onExplore?: (accountId: string) => void;
}
export const AccountCards: React.FC<Props> = ({accounts, editingAccountId, editingName, setEditingAccountId, setEditingName, handleSaveName, handleDeactivate, canDeactivate, canManage, busy, isLoading, loadFailed, onExplore}) => {
  return <>{accounts.map((acc) => {
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
                  onKeyDown={e => { if (e.key === "Escape") setEditingAccountId(""); if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSaveName(acc.id); } }}
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
              <strong className={`metric-amount${acc.balance_paisa < 0 ? " account-negative" : ""}`}>
                <AnimatedAmount amountPaisa={acc.balance_paisa} loading={isLoading} error={loadFailed} />
              </strong>
              {onExplore && <button type="button" className="account-history-link" onClick={() => onExplore(acc.id)} aria-label={`View transactions for ${acc.name}`}>View transactions</button>}
            </div>
          );
        })}
  </>;
};
