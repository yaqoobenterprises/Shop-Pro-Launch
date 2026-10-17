import React from "react";
import { isFeatureEnabled } from "../../config/features";
import { RegionSettingsSection } from "./RegionSettingsSection";

export const RegionSettingsGate: React.FC = () => {
  if (!isFeatureEnabled("regionSettings")) return null;
  return <RegionSettingsSection />;
};
