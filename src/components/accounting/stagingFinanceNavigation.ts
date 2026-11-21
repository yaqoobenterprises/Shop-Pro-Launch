/**
 * Shared, permission-aware menu presentation for staging-only V2 workflows.
 * This does NOT grant SQL authorization: every operation requires live server checks.
 */
import type { ComponentType } from "react";
import { BookOpenCheck, ClipboardCheck, FilePlus2, FileText, HandCoins, ReceiptText, Landmark, ScrollText, UserRoundPlus, } from "lucide-react";
import type { AppView } from "../../context/AppContext";
import { isIsolatedReceivablesReadEnabled } from "../../services/aqvoraReceivablesStagingGate";
import { isIsolatedSalesDraftCreationEnabled } from "../../services/aqvoraStagingSalesDraftService";
import { isIsolatedInvoiceLifecycleEnabled } from "../../services/aqvoraSalesLifecycleService";
import { isIsolatedVerifiedFinancialReadEnabled } from "../../services/aqvoraVerifiedFinancialReadService";
import { isFreshFinanceSetupStagingEnabled } from "../../services/aqvoraFreshFinanceSetupService";
import { isFreshOwnerInvitationStagingEnabled } from "../../services/aqvoraFreshOwnerInvitationService";
import { isIsolatedManualJournalEnabled } from "../../services/aqvoraManualJournalService";
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
  if (!flags.isCloudAccount || flags.isDemoMode) return [];
  const result:StagingFinanceNavItem[]=[];
  // Recipients are not yet members of the inviting company, so they must
  // still be able to reach acceptance from their own verified cloud account.
  if (isFreshOwnerInvitationStagingEnabled()) {
    result.push({id:"aqvora-owner-invites",label:"Owner invitations",icon:UserRoundPlus});
  }
  if (flags.role!=="OWNER"&&flags.role!=="MANAGER") return result;
  if(flags.role==="OWNER"&&isFreshFinanceSetupStagingEnabled()){
    result.push({id:"aqvora-finance-setup",label:"Finance setup",icon:Landmark});
  }
  if(flags.role==="OWNER"&&isIsolatedManualJournalEnabled()){
    result.push({id:"aqvora-manual-journal",label:"Journal posting",icon:ScrollText});
  }
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
