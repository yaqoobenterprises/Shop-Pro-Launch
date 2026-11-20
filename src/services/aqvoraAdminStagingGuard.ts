import { getSupabaseConfig, isSupabaseConfigured } from "../lib/supabase";
import { isAqvoraAdminReadPreviewEnabled } from "./aqvoraAdminReadService";

/**
 * Presentation gate only, not financial authorization. SQL RLS/RPC checks own
 * authorization. This blocks accidental activation against known business
 * projects while the rollout contract remains in Draft.
 */
const EXISTING_BUSINESS_PROJECTS = new Set([
  "xarbzazjzcaezcpstiga",
  "ienwbrrzsutbispaiymi",
]);

export function isAqvoraIsolatedStagingReadEnabled(): boolean {
  if (!isAqvoraAdminReadPreviewEnabled() ||
      import.meta.env.VITE_AQVORA_ISOLATED_STAGING_REVIEW !== "true" ||
      !isSupabaseConfigured()) return false;

  const ref = (import.meta.env.VITE_AQVORA_STAGING_PROJECT_REF as string | undefined)?.trim().toLowerCase();
  if (!ref || !/^[a-z]{20}$/.test(ref) || EXISTING_BUSINESS_PROJECTS.has(ref)) return false;

  const { url } = getSupabaseConfig();
  // Exact host match, no path or lookalike domain; no existing business project.
  return url.toLowerCase() === "https://" + ref + ".supabase.co";
}
