import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {BookOpenCheck} from "lucide-react";
import type {VerifiedTrialBalance} from "../src/accounting/verifiedTrialBalance";
import type {StagingFinanceNavItem} from "../src/components/accounting/stagingFinanceNavigation";
import {FinanceDesignPreview} from "../src/components/accounting/FinanceDesignPreview";
import {GLTBReportPanel} from "../src/components/accounting/GLTBReportPanel";

const org="11111111-1111-4111-8111-111111111111";
const author="22222222-2222-4222-8222-222222222222";
const sha="a".repeat(64);
const policy={
  contract_version:"aqvora-currency-policy-v1",status:"configured",
  organization_id:org,transaction_currency:"PKR",ledger_currency:"PKR",
  currency_exponent:2,minor_units_per_major:"100",display_decimal_places:2,
  revision:"1",effective_from:"2026-01-01",fingerprint:sha,
  provenance:{kind:"trusted_company_accounting_policy",
    authority_reference:"synthetic",authority_revision:"1",
    approval_reference:"synthetic-approved",approved_by:author},
  source_rounding:"quantity_millionths_half_up_per_line_v1",fx_supported:false,
};
const source=(configured:boolean)=>({
  organization_id:org,currency:"PKR",to_date:"2026-11-21",
  snapshot_token:sha,
  currency_evidence_version:"aqvora-currency-report-v1",
  currency_policy_status:configured?"configured":"unconfigured",
  display_complete:configured,currency_policy:configured?policy:null,
  currency_policy_revisions:configured?[policy]:[],
  currency_policy_timeline_fingerprint:sha,
});
const tb=(configured:boolean)=>({
  source:source(configured),rows:[],
  totals:{debit_minor:"150",credit_minor:"150",
    closing_debit_minor:"150",closing_credit_minor:"150"},
}) as unknown as VerifiedTrialBalance;

afterEach(()=>{cleanup();vi.clearAllMocks();});

describe("AQVORA audited currency evidence in real read-only workspace",()=>{
  it("renders exact major units only for trusted complete company policy",()=>{
    render(<GLTBReportPanel mode="tb" currency="PKR" report={tb(true)}/>);
    expect(screen.getByText(/Source-certified currency display/)).toBeTruthy();
    expect(screen.getAllByText("PKR 1.50")).toHaveLength(4);
    expect(screen.getByText(/policy revision 1/)).toBeTruthy();
  });
  it("marks historical or unconfigured report raw rather than invented major units",()=>{
    render(<GLTBReportPanel mode="tb" currency="PKR" report={tb(false)}/>);
    expect(screen.getByText(/Currency display incomplete/)).toBeTruthy();
    expect(screen.getAllByText("PKR 150 minor units")).toHaveLength(4);
    expect(screen.queryByText("PKR 1.50")).toBeNull();
  });
});

describe("AQVORA one-workspace handoff to authenticated staging",()=>{
  const links=[{id:"aqvora-gl-tb",label:"GL & Trial Balance",
    icon:BookOpenCheck}] as StagingFinanceNavItem[];
  it("hides all source navigation in sample-only preview by default",()=>{
    render(<FinanceDesignPreview onClose={vi.fn()}/>);
    expect(screen.queryByText(/VERIFIED STAGING ONLY/)).toBeNull();
    expect(screen.queryByText(/Open GL & Trial Balance/)).toBeNull();
  });
  it("opens existing verified workspaces when supplied by the safe Auth/flag gate",()=>{
    const navigate=vi.fn();
    render(<FinanceDesignPreview onClose={vi.fn()}
      stagingLinks={links} onOpenStaging={navigate}/>);
    expect(screen.getByText(/VERIFIED STAGING ONLY/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Open GL & Trial Balance"}));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("aqvora-gl-tb");
    expect(screen.getByText(/Illustrative company/)).toBeTruthy();
  });
});
