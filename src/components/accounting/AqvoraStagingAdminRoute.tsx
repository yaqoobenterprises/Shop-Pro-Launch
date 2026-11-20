import React, { lazy, Suspense } from "react";
import { useAuth } from "../../context/AuthContext";
import { isAqvoraIsolatedStagingReadEnabled } from "../../services/aqvoraAdminStagingGuard";

const View = lazy(() => import("./AqvoraStagingAdminView")
  .then((module) => ({ default: module.AqvoraStagingAdminView })));

/** One guarded route; never silently mounts live administration in a demo. */
export const AqvoraStagingAdminRoute: React.FC = () => {
  const { isCloudAccount, isDemoMode, organization, user } = useAuth();
  if (!isAqvoraIsolatedStagingReadEnabled() || isDemoMode || !isCloudAccount) {
    return <div role="alert" className="p-6 text-sm text-text-muted">
      AQVORA V2 staging access is unavailable.
    </div>;
  }
  return <Suspense fallback={<div role="status">Loading authorized company administration…</div>}>
    <View key={organization.id + ":" + (user?.id || "")}
      organizationId={organization.id} userId={user?.id}
      isCloudAccount={isCloudAccount} isDemoMode={isDemoMode} />
  </Suspense>;
};
