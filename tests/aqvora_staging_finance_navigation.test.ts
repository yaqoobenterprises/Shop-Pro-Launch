import {beforeEach,describe,expect,it,vi} from "vitest";
import {getStagingFinanceNavItems} from "../src/components/accounting/stagingFinanceNavigation";

const flags=vi.hoisted(()=>({
  ar:vi.fn(),sales:vi.fn(),gl:vi.fn(),approvals:vi.fn(),cash:vi.fn(),receipt:vi.fn(),
}));
vi.mock("../src/services/aqvoraReceivablesStagingGate",()=>({
  isIsolatedReceivablesReadEnabled:flags.ar,
}));
vi.mock("../src/services/aqvoraStagingSalesDraftService",()=>({
  isIsolatedSalesDraftCreationEnabled:flags.sales,
}));
vi.mock("../src/services/aqvoraVerifiedFinancialReadService",()=>({
  isIsolatedVerifiedFinancialReadEnabled:flags.gl,
}));
vi.mock("../src/services/aqvoraSalesLifecycleService",()=>({
  isIsolatedInvoiceLifecycleEnabled:flags.approvals,
}));
vi.mock("../src/services/aqvoraCashCollectionOperations",()=>({
  isIsolatedCashCollectionEnabled:flags.cash,
}));
vi.mock("../src/services/aqvoraReceiptDraftService",()=>({
  isIsolatedReceiptDraftEnabled:flags.receipt,
}));
beforeEach(()=>{
  flags.ar.mockReturnValue(true);flags.sales.mockReturnValue(true);
  flags.gl.mockReturnValue(true);flags.approvals.mockReturnValue(true);
  flags.cash.mockReturnValue(true);
  flags.receipt.mockReturnValue(true);
});
describe("AQVORA shared staging-only finance navigation",()=>{
  it("keeps ALL V2 workflows hidden outside a cloud manager/owner role",()=>{
    for (const f of [
      {isCloudAccount:false,isDemoMode:false,role:"OWNER"},
      {isCloudAccount:true,isDemoMode:true,role:"OWNER"},
      {isCloudAccount:true,isDemoMode:false,role:"CASHIER"},
      {isCloudAccount:true,isDemoMode:false,role:undefined},
    ]) {
      expect(getStagingFinanceNavItems(f)).toEqual([]);
    }
    expect(flags.cash).not.toHaveBeenCalled();
  });
  it("offers separate real finance routes only when each flag is enabled",()=>{
    const all=getStagingFinanceNavItems({
      isCloudAccount:true,isDemoMode:false,role:"MANAGER",
    });
    expect(all.map(x=>x.id)).toEqual([
      "aqvora-receivables","aqvora-sales-drafts","aqvora-gl-tb",
      "aqvora-sales-lifecycle","aqvora-cash-collections","aqvora-receipt-drafts",
    ]);
    flags.receipt.mockReturnValue(false);
    expect(getStagingFinanceNavItems({
      isCloudAccount:true,isDemoMode:false,role:"OWNER",
    }).some(x=>x.id==="aqvora-receipt-drafts")).toBe(false);
    flags.cash.mockReturnValue(false);
    expect(getStagingFinanceNavItems({
      isCloudAccount:true,isDemoMode:false,role:"OWNER",
    }).some(x=>x.id==="aqvora-cash-collections")).toBe(false);
  });
});
