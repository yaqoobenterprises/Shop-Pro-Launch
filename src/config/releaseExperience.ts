/** Release entry policy.
 * New clean AQVORA installations open the real Overview, not a synthetic preview.
 * Synthetic review remains opt-in in isolated preview builds only.
 */
export type AQVORAInitialView="dashboard"|"aqvora-erp-preview";
export function initialAQVORAView(sampleFirst:boolean):AQVORAInitialView{
  return sampleFirst?"aqvora-erp-preview":"dashboard";
}
export const releaseInitialView=initialAQVORAView(
  import.meta.env.VITE_AQVORA_PREVIEW_DEFAULT==="true",
);
