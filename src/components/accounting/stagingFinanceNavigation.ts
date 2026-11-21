/**
 * Shared, permission-aware menu presentation for staging-only V2 workflows.
 * This does NOT grant SQL authorization: every operation requires live server checks.
 */
import type { ComponentType } from "react";
import { BookOpenCheck, ClipboardCheck, FilePlus2, FileText, HandCoins, ReceiptText, } from "lucide-react";
import type { AppView } from "../../context/AppContext";
import { isIsolatedReceivablesReadEnabled } from "../../services/aqvoraReceivablesStagingGate";
import { isIsolatedSalesDraftCreationEnabled } from "../../services/aqvoraStagingSalesDraftService";
import { isIsolatedInvoiceLifecycleEnabled } from "../../services/aqvoraSalesLifecycleService";
import { isIsolatedVerifiedFinancialReadEnabled } from "../../services/aqvoraVerifiedFinancialReadService";
import { isIsolatedCashCollectionEnabled } from "../../services/aqvoraCashCollectionOperations";
import { isIsolatedReceiptDraftEnabled } from "../../services/aqvoraReceiptDraftService";

export interface StagingFinanceNavItem {
  id: AppView;
  label: string;
  icon: ComponentType<{className?:string}>;
}
export function getStagingFinanceNavItems(flags:{
  isCloudAccount:boolean; isDemoMode:boolean; role:string|undefined;
}):StagingFinanceNavItem[] {
  if (!flags.isCloudAccount || flags.isDemoMode ||
      (flags.role!=="OWNER"&&flags.role!=="MANAGER"))return [];
  const result:StagingFinanceNavItem[]=[];
  if(isIsolatedReceivablesReadEnabled()){
    result.push({id:"aqvora-receivables",label:"Receivables",icon:FileText});
  }
  if(isIsolatedSalesDraftCreationEnabled()){
    result.push({id:"aqvora-sales-drafts",label:"Service drafts",icon:FilePlus2});
  }
  if(isIsolatedVerifiedFinancialReadEnabled()){
    result.push({id:"aqvora-gl-tb",label:"GL & Trial Balance",icon:BookOpenCheck});
  }
  if(isIsolatedInvoiceLifecycleEnabled()){
    result.push({id:"aqvora-sales-lifecycle",label:"Invoice approvals",icon:ClipboardCheck});
  }
  if(isIsolatedCashCollectionEnabled()){
    result.push({id:"aqvora-cash-collections",label:"Cash collections",icon:HandCoins});
  }
  if(isIsolatedReceiptDraftEnabled()){
    result.push({id:"aqvora-receipt-drafts",label:"Customer receipts",icon:ReceiptText});
  }
  return result;
}
