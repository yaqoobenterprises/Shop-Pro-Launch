/**
 * Default-OFF, isolated-staging-only transport for Codex V2 GL/TB readers.
 * This module DOES NOT mount a route, enable a financial writer, or imply that
 * legacy Shop Pro balances belong to these V2 reports.
 *
 * Authorization is always enforced by PostgreSQL PR #53. Client checks are
 * fail-closed defense-in-depth and prevent accidental production-project reads.
 */
import {
  getSupabaseClient, getSupabaseConfig, hasConfiguredCloudSession,
  isSupabaseConfigured,
} from "../lib/supabase";
import {
  readVerifiedGeneralLedger, type GeneralLedgerRead,
} from "../accounting/verifiedGeneralLedger";
import {
  readVerifiedTrialBalance, type VerifiedTrialBalance,
} from "../accounting/verifiedTrialBalance";
import type { CollectionOptions, FinancialPageRpc } from "../accounting/verifiedReadCollection";

const EXISTING_BUSINESS_PROJECTS = new Set([
  "xarbzazjzcaezcpstiga",
  "ienwbrrzsutbispaiymi",
]);

export interface VerifiedReportRequest {
  organizationId: string;
  userId: string;
  isCloudAccount: boolean;
  currency: string;
  fromDate: string;
  toDate: string;
}
export interface VerifiedGeneralLedgerRequest extends VerifiedReportRequest {
  accountId: string;
}

/** This gate is for routing only; it is NOT an authorization credential. */
export function isIsolatedVerifiedFinancialReadEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS !== "true" ||
      import.meta.env.VITE_AQVORA_ISOLATED_STAGING_REVIEW !== "true" ||
      !isSupabaseConfigured()) return false;
  const ref = (import.meta.env.VITE_AQVORA_STAGING_PROJECT_REF as string | undefined)
    ?.trim().toLowerCase();
  if (!ref || !/^[a-z]{20}$/.test(ref) || EXISTING_BUSINESS_PROJECTS.has(ref)) {
    return false;
  }
  // Refuse lookalikes, custom redirects, and all known existing-business hosts.
  return getSupabaseConfig().url.toLowerCase() === `https://${ref}.supabase.co`;
}

function assertRequest(request: VerifiedReportRequest): void {
  if (!request.isCloudAccount || !request.userId?.trim() ||
      !request.organizationId?.trim()) {
    throw new Error("A signed-in cloud user and company are required for certified accounting reads.");
  }
}

/**
 * Rechecks the selected user before AND after every HTTP page. This cannot
 * substitute for the database's live session / tenant / AAL2 checks.
 */
async function assertSafeSession(request: VerifiedReportRequest): Promise<void> {
  if (!isIsolatedVerifiedFinancialReadEnabled()) {
    throw new Error("AQVORA certified financial reads are disabled outside isolated staging.");
  }
  if (!(await hasConfiguredCloudSession(request.userId))) {
    throw new Error("The verified accounting session is unavailable. Sign in again.");
  }
}

function reader(
  request: VerifiedReportRequest,
  name: "read_aqvora_general_ledger" | "read_aqvora_trial_balance",
): FinancialPageRpc {
  return async (args) => {
    await assertSafeSession(request);
    const { data, error } = await getSupabaseClient().rpc(name, args);
    if (error) throw error; // 42501, 23514 and 40001 must never turn into zeros.
    await assertSafeSession(request);
    return data;
  };
}

export async function loadIsolatedVerifiedGeneralLedger(
  request: VerifiedGeneralLedgerRequest,
  options?: CollectionOptions,
): Promise<GeneralLedgerRead> {
  assertRequest(request);
  await assertSafeSession(request);
  if (!request.accountId?.trim()) throw new Error("Select one posting account.");
  const report = await readVerifiedGeneralLedger(
    reader(request, "read_aqvora_general_ledger"),
    {
      p_organization_id: request.organizationId,
      p_account_id: request.accountId,
      p_currency: request.currency,
      p_from_date: request.fromDate,
      p_to_date: request.toDate,
    },
    options,
  );
  await assertSafeSession(request);
  if (report.source.authorized_user_id !== request.userId) {
    throw new Error("Certified General Ledger returned a different authorized user.");
  }
  return report;
}

export async function loadIsolatedVerifiedTrialBalance(
  request: VerifiedReportRequest,
  options?: CollectionOptions,
): Promise<VerifiedTrialBalance> {
  assertRequest(request);
  await assertSafeSession(request);
  const report = await readVerifiedTrialBalance(
    reader(request, "read_aqvora_trial_balance"),
    {
      p_organization_id: request.organizationId,
      p_currency: request.currency,
      p_from_date: request.fromDate,
      p_to_date: request.toDate,
    },
    options,
  );
  await assertSafeSession(request);
  if (report.source.authorized_user_id !== request.userId) {
    throw new Error("Certified Trial Balance returned a different authorized user.");
  }
  return report;
}
