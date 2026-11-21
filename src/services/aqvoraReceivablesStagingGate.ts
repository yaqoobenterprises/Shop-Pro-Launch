/**
 * Inactive staging-only transport. Browser flags gate accidental use; ONLY the
 * source-owned PostgreSQL RPC grants and live AAL2 membership authorize reads.
 * No company enrollment, schema migration or financial writer is enabled.
 */
import {
  getSupabaseClient, getSupabaseConfig, hasConfiguredCloudSession,
  isSupabaseConfigured,
} from "../lib/supabase";
import {
  uuid, validateContext, type ReceivableReadContext,
} from "../accounting/receiptReadPrimitives";

const KNOWN_EXISTING_PROJECTS = new Set([
  "xarbzazjzcaezcpstiga",
  "ienwbrrzsutbispaiymi",
]);

export interface IsolatedReceivablesContext extends ReceivableReadContext {
  userId: string;
  isCloudAccount: boolean;
}

export type ReceivablesReadRpc =
  | "get_aqvora_invoice_open_balance"
  | "list_aqvora_open_invoices"
  | "read_aqvora_receivables"
  | "get_aqvora_cash_collection"
  | "get_aqvora_customer_receipt"
  | "lookup_aqvora_customer_receipt_issue"
  | "list_aqvora_customers"
  | "get_aqvora_sales_invoice"
  | "lookup_aqvora_sales_issue";

export function isIsolatedReceivablesReadEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_AQVORA_VERIFIED_AR_READS !== "true" ||
      import.meta.env.VITE_AQVORA_ISOLATED_STAGING_REVIEW !== "true" ||
      !isSupabaseConfigured()) return false;

  const ref = (import.meta.env.VITE_AQVORA_STAGING_PROJECT_REF as string | undefined)
    ?.trim().toLowerCase();
  if (!ref || !/^[a-z]{20}$/.test(ref) || KNOWN_EXISTING_PROJECTS.has(ref)) {
    return false;
  }
  return getSupabaseConfig().url.toLowerCase() === `https://${ref}.supabase.co`;
}

export async function requireIsolatedReceivablesSession(
  context: IsolatedReceivablesContext,
): Promise<void> {
  if (!isIsolatedReceivablesReadEnabled()) {
    throw new Error("AQVORA verified AR reads are disabled outside isolated staging.");
  }
  validateContext(context);
  uuid(context.userId, "authenticated user");
  if (!context.isCloudAccount ||
      !(await hasConfiguredCloudSession(context.userId))) {
    throw new Error("Matching live cloud session required for AQVORA AR reads.");
  }
}

/** Reject RPC errors, lost sessions and malformed responses. No demo fallback. */
export async function requestIsolatedReceivablesRpc(
  context: IsolatedReceivablesContext,
  method: ReceivablesReadRpc,
  args: Record<string, unknown>,
): Promise<unknown> {
  await requireIsolatedReceivablesSession(context);
  const { data, error } = await getSupabaseClient().rpc(method, args);
  if (error) throw error; // Propagate 42501, 23514, 40001 unchanged.
  await requireIsolatedReceivablesSession(context);
  return data;
}
