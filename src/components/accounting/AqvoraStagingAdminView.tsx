import React, { useEffect, useState } from "react";
import { AqvoraAdminReadPanels, type AqvoraAdminReadState } from "./AqvoraAdminReadPanels";
import { loadAqvoraCompleteAdminReadSnapshot } from "../../services/aqvoraAdminReadService";
import { isAqvoraIsolatedStagingReadEnabled } from "../../services/aqvoraAdminStagingGuard";
import "./FinanceDesignPreview.css";
import "./FinanceFinish.css";
import "./FinanceAdmin.css";

interface Props {
  organizationId: string;
  userId?: string;
  isCloudAccount: boolean;
  isDemoMode: boolean;
}

/** One separate, staging-gated accounting route. Never backed by sample finance data. */
export const AqvoraStagingAdminView: React.FC<Props> = ({
  organizationId, userId, isCloudAccount, isDemoMode,
}) => {
  const [retryKey, setRetryKey] = useState(0);
  const [read, setRead] = useState<{ identity: string; state: AqvoraAdminReadState }>({
    identity: "", state: { status: "loading" },
  });
  const identity = organizationId + ":" + (userId || "");

  useEffect(() => {
    if (!isAqvoraIsolatedStagingReadEnabled() || isDemoMode) {
      setRead({ identity, state: { status: "disabled" } });
      return;
    }
    if (!userId || !organizationId || !isCloudAccount) {
      setRead({ identity, state: { status: "unauthorized" } });
      return;
    }
    let active = true;
    setRead({ identity, state: { status: "loading" } });
    void loadAqvoraCompleteAdminReadSnapshot({ organizationId, userId, isCloudAccount })
      .then((snapshot) => {
        if (active) setRead({ identity, state: { status: "ready", snapshot } });
      })
      .catch(() => {
        if (active) setRead({ identity, state: { status: "error" } });
      });
    return () => { active = false; };
  }, [organizationId, userId, isCloudAccount, isDemoMode, retryKey, identity]);

  // Old company data must not survive a tenant/user switch even for one render.
  const state: AqvoraAdminReadState = read.identity === identity
    ? read.state : { status: "loading" };
  const presentation: AqvoraAdminReadState = state.status === "error"
    ? { status: "error", onRetry: () => setRetryKey((x) => x + 1) }
    : state;

  return <section className="aq-finance aq-finance--staging" aria-label="AQVORA isolated staging administration">
    <header className="aq-finance__welcome">
      <span>ACCOUNTING / ISOLATED STAGING</span>
      <h1>Company books</h1>
      <p>Verified company records only · read-only · no journal posting or administration writes</p>
    </header>
    <AqvoraAdminReadPanels state={presentation} />
  </section>;
};
