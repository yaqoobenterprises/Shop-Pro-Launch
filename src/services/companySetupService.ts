import type { Organization } from "../types";
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";
import { prepareCompanySetup, type CompanySetupInput, type CompanySetupValues } from "../lib/companySetupValidation";
import { sqliteRepository } from "./sqliteRepository";

interface CompanySetupRequest {
  userId: string;
  organization: Organization;
  isCloudAccount: boolean;
  input: CompanySetupInput;
}

/** First-run company metadata only. Accounting policy and opening entries are separate workflows. */
export async function saveFirstRunCompanySetup(request: CompanySetupRequest): Promise<CompanySetupValues> {
  const { organization, userId, isCloudAccount } = request;
  const setup = prepareCompanySetup(request.input);
  if (!userId || !organization.id) throw new Error("Sign in to set up your company.");

  if (!isCloudAccount) {
    // Legacy local books may contain amounts; never silently relabel their currency.
    if (setup.currency !== organization.currency) {
      throw new Error("Changing currency on an offline company requires an accounting review.");
    }
    await sqliteRepository.updateOrganization({
      id: organization.id, ...setup, updated_at: new Date().toISOString(),
    });
    return setup;
  }

  if (!(await hasConfiguredCloudSession(userId))) {
    throw new Error("Cloud session expired. Sign in before saving company settings.");
  }

  const client = getSupabaseClient();
  // Client checks support the UX, but the production database must enforce owner-only RLS.
  const { data: membership, error: memberError } = await client
    .from("organization_members")
    .select("role, is_active")
    .eq("organization_id", organization.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError || !membership || membership.role !== "OWNER" || membership.is_active !== true) {
    throw new Error("Only an active company owner may finish company setup.");
  }

  if (setup.currency !== organization.currency) {
    // A currency switch after financial activity can invalidate every report.
    // Unknown or inaccessible data is not equivalent to an empty ledger.
    const [{ count: transactionCount, error: transactionError },
      { count: entryCount, error: entryError }] = await Promise.all([
      client.from("transactions").select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id),
      client.from("account_ledger_entries").select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id),
    ]);
    if (transactionError || entryError || transactionCount === null || entryCount === null) {
      throw new Error("Cannot verify the company ledger is empty. Currency was not changed.");
    }
    if (transactionCount > 0 || entryCount > 0) {
      throw new Error("Currency is locked because this company already has accounting entries.");
    }
  }

  const { data, error } = await client
    .from("organizations")
    .update({ ...setup, updated_at: new Date().toISOString() })
    .eq("id", organization.id)
    .select("id,name,business_category,currency,currency_symbol,country,timezone,region_configured")
    .maybeSingle();
  if (error) throw new Error(error.message);
  // A 200 response with zero updated rows is a common RLS denial: never mark it saved.
  if (!data || data.id !== organization.id ||
      data.name !== setup.name || data.currency !== setup.currency ||
      data.country !== setup.country || data.timezone !== setup.timezone ||
      data.region_configured !== true) {
    throw new Error("Company setup was not confirmed by the server. Review access and retry.");
  }
  return setup;
}
