import React, { useState } from "react";
import { AlertTriangle, BookOpen, CalendarRange, ShieldAlert } from "lucide-react";
import type { AqvoraAdminReadSnapshot } from "../../services/aqvoraAdminReadService";
import { ChartExplorer } from "./ChartExplorer";
import { FiscalPeriodPanel } from "./FiscalPeriodPanel";

/** A staging-only, presentation-only boundary; no RPC calls, writes or demo fallback. */
export type AqvoraAdminReadState =
  | { status: "disabled" }
  | { status: "unauthorized" }
  | { status: "loading" }
  | { status: "error"; onRetry?: () => void }
  | { status: "ready"; snapshot: AqvoraAdminReadSnapshot };

interface Props {
  state: AqvoraAdminReadState;
}

export const AqvoraAdminReadPanels: React.FC<Props> = ({ state }) => {
  const [tab, setTab] = useState<"accounts" | "periods">("accounts");
  if (state.status === "disabled") {
    return <section className="aq-finance__panel aq-admin__state" role="status">
      <ShieldAlert size={23} aria-hidden="true"/>
      <h2>AQVORA V2 administration is unavailable</h2>
      <p>Verified isolated staging is required before company accounting readers are activated.</p>
    </section>;
  }
  if (state.status === "unauthorized") {
    return <section className="aq-finance__panel aq-admin__state" role="alert">
      <ShieldAlert size={23} aria-hidden="true"/>
      <h2>Company access required</h2>
      <p>Sign in to the authorized company with a valid session. No account or period data is shown.</p>
    </section>;
  }
  if (state.status === "loading") {
    return <section className="aq-finance__panel aq-admin__state" role="status" aria-live="polite">
      <h2>Verifying company accounts</h2>
      <p>Loading authorized accounting records. No estimates or sample substitutes.</p>
    </section>;
  }
  if (state.status === "error") {
    return <section className="aq-finance__panel aq-admin__state" role="alert">
      <AlertTriangle size={23} aria-hidden="true"/>
      <h2>Financial records could not be verified</h2>
      <p>No values are displayed because the company read did not complete successfully.</p>
      {state.onRetry && <button type="button" className="aq-finance__button"
        onClick={state.onRetry}>Retry authorized read</button>}
    </section>;
  }

  const { snapshot } = state;
  const tenantValid = snapshot.source === "authenticated-admin-rpc" &&
    !!snapshot.organizationId &&
    snapshot.accounts.every((row) => row.organizationId === snapshot.organizationId) &&
    snapshot.periods.every((row) => row.organizationId === snapshot.organizationId);
  if (!tenantValid) {
    return <section className="aq-finance__panel aq-admin__state" role="alert">
      <ShieldAlert size={23} aria-hidden="true"/>
      <h2>Company data verification failed</h2>
      <p>Financial data cannot be shown because the source identity is inconsistent.</p>
    </section>;
  }

  return <div className="aq-admin__verified">
    <div className="aq-admin__verified-header">
      <div>
        <span className="aq-finance__eyebrow">AUTHORIZED, READ-ONLY COMPANY SOURCE</span>
        <h2>Accounting administration</h2>
        <p>Company ID: <code>{snapshot.organizationId}</code></p>
      </div>
      <span className="aq-admin__source-pill">Authenticated server read</span>
    </div>
    {(snapshot.hasMoreAccounts || snapshot.hasMorePeriods) && <p className="aq-admin__incomplete" role="status">
      The server returned only the first page. Counts and filters below apply to loaded records, not the complete books.
    </p>}
    <nav className="aq-admin__tabs" aria-label="Administration views">
      <button type="button" aria-current={tab === "accounts" ? "page" : undefined}
        onClick={() => setTab("accounts")}><BookOpen size={16} aria-hidden="true"/> Chart of Accounts</button>
      <button type="button" aria-current={tab === "periods" ? "page" : undefined}
        onClick={() => setTab("periods")}><CalendarRange size={16} aria-hidden="true"/> Fiscal Periods</button>
    </nav>
    {tab === "accounts" ? <ChartExplorer accounts={snapshot.accounts} isSample={false}
      hasMoreOnServer={snapshot.hasMoreAccounts}/> :
      <FiscalPeriodPanel periods={snapshot.periods} source="authenticated-admin-rpc"
        hasMoreOnServer={snapshot.hasMorePeriods}/>}
  </div>;
};
