/** Founder-approved product direction: one workspace, legacy Cashbook as
 * the quick-entry surface, ERP workflows separate from synthetic review data.
 *
 * This is PREVIEW-ONLY until legacy history and the V2 books are reconciled.
 */
export function unifiedWorkspaceReviewEnabled():boolean{
  return import.meta.env.VITE_AQVORA_UNIFIED_WORKSPACE_PREVIEW==="true";
}
