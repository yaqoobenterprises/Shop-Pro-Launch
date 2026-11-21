/** Release entry policy.
 * Existing installations must open the working ledger. The synthetic ERP review
 * is opt-in unless a deliberately isolated preview build opts into sample-first.
 */
import {unifiedWorkspaceReviewEnabled} from "./unifiedWorkspace";
export type AQVORAInitialView="chat"|"aqvora-erp-preview";
export function initialAQVORAView(sampleFirst:boolean):AQVORAInitialView{
  return sampleFirst?"aqvora-erp-preview":"chat";
}
export const releaseInitialView=initialAQVORAView(
  import.meta.env.VITE_AQVORA_PREVIEW_DEFAULT==="true" || unifiedWorkspaceReviewEnabled(),
);
