import { getSecurityPrincipal } from "../lib/security";
import { getSupabaseClient } from "../lib/supabase";
import { requireAuthoritativeCloudRead } from "./ledgerReadPolicy";
import type { AccountLedgerEntry, LedgerAccount } from "../types/ledger";

export const accountHistoryService = {
  async accounts(): Promise<Pick<LedgerAccount,"id"|"name"|"is_active">[]> {
    const principal=getSecurityPrincipal();
    await requireAuthoritativeCloudRead(principal,"account history");
    const {data,error}=await getSupabaseClient().from("payment_accounts").select("id,name,is_active").eq("organization_id",principal!.organizationId).order("name").order("id").limit(1000);
    if(error || !data) throw error || new Error("Account history unavailable.");
    return data;
  },
  async entries(accountId:string,page:number): Promise<{rows:AccountLedgerEntry[];count:number}> {
    const principal=getSecurityPrincipal();
    await requireAuthoritativeCloudRead(principal,"account postings");
    const {data,error,count}=await getSupabaseClient().from("account_ledger_entries").select("*",{count:"exact"}).eq("organization_id",principal!.organizationId).eq("account_id",accountId).order("created_at",{ascending:false}).order("id",{ascending:true}).range(page*25,page*25+24);
    if(error || !data || count===null) throw error || new Error("Account posting history unavailable.");
    return {rows:data as AccountLedgerEntry[],count};
  }
};
