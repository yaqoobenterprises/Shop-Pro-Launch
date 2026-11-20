import type { AccountingReadAccount } from "../accounting/readContracts";
import { validateReadAccount } from "../accounting/verifiedReadValidation";
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";
import { isIsolatedVerifiedFinancialReadEnabled } from "./aqvoraVerifiedFinancialReadService";

/** Staging-only company account picker. Live keyset paging is NOT a certified GL snapshot. */
export async function listIsolatedPostingAccounts(
  input: {organizationId:string;userId:string;isCloudAccount:boolean},
  limits:{pageSize?:number;maxPages?:number}={},
):Promise<AccountingReadAccount[]> {
  if(!isIsolatedVerifiedFinancialReadEnabled()||!input.isCloudAccount ||
      !input.userId || !input.organizationId) {
    throw new Error("Verified accounting account listing is disabled outside isolated staging.");
  }
  const pageSize=limits.pageSize??100;
  const maxPages=limits.maxPages??30;
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200 ||
     !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>50) {
    throw new Error("Invalid bounded account listing.");
  }
  const accounts:AccountingReadAccount[]=[];
  const ids=new Set<string>();
  let after:string|null=null;
  for(let page=0;page<maxPages;page++){
    if(!(await hasConfiguredCloudSession(input.userId))) {
      throw new Error("Verified accounting session unavailable.");
    }
    const {data,error}=await getSupabaseClient().rpc("list_aqvora_accounts",{
      p_organization_id:input.organizationId,p_after_code:after,p_limit:pageSize,
    });
    if(error)throw error;
    if(!(await hasConfiguredCloudSession(input.userId))) {
      throw new Error("Verified accounting session unavailable.");
    }
    if(!Array.isArray(data)||data.length>pageSize) {
      throw new Error("Invalid account picker page.");
    }
    for(const item of data){
      if(!item||typeof item!=="object"||Array.isArray(item)) {
        throw new Error("Malformed chart account.");
      }
      const account=item as Record<string,unknown>;
      if(account.organization_id!==input.organizationId ||
          typeof account.code!=="string" || !account.code.trim() ||
          after!==null && account.code<=after) {
        throw new Error("Account list contains foreign or duplicated code.");
      }
      if(typeof account.id!=="string" || !account.id ||
          ids.has(account.id) || typeof account.name!=="string" ||
          !account.name.trim() ||
          typeof account.revision!=="string" ||
          !/^[1-9][0-9]*$/.test(account.revision)) {
        throw new Error("Invalid account metadata or duplicate identifier.");
      }
      if(account.is_posting===true)validateReadAccount(account,input.organizationId);
      ids.add(account.id);
      after=account.code;
      if(account.is_active===true && account.is_posting===true) {
        accounts.push(account as unknown as AccountingReadAccount);
      }
    }
    if(data.length<pageSize)return accounts;
  }
  throw new Error("Account picker exceeded safe pagination limit.");
}
