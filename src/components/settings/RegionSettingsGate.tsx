import React from "react";
import { useFeature } from "../../config/features";
import { RegionSettingsSection } from "./RegionSettingsSection";

export const RegionSettingsGate: React.FC = () => {
  if (!useFeature("regionSettings")) return null;
  return <RegionSettingsSection />;
};
