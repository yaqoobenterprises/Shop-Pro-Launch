import React from "react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";

const h=vi.hoisted(()=>({
  isEnabled:vi.fn(()=>true),read:vi.fn(),
  role:"OWNER" as string,
  organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}));
const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sample={
  organizationId:ORG,currency:"PKR",sourceToken:"b".repeat(64),
  zeroFinancialHistoryCertified:true,currencyPolicyRevision:"1",
  fiscalPeriods:1,postingAccounts:6,blockers:[],
  checklistComplete:true,activationPermitted:false,
  stage:"READ_ONLY_STAGING_PREFLIGHT",
};
vi.mock("../src/context/AuthContext",()=>({
  useAuth:()=>({user:{id:"11111111-1111-4111-8111-111111111111",role:h.role},
    organization:{id:h.organizationId,currency:"PKR"},
    isCloudAccount:true,isDemoMode:false}),
}));
vi.mock("../src/services/aqvoraFreshFinanceSetupService",()=>({
  isFreshFinanceSetupStagingEnabled:h.isEnabled,
}));
vi.mock("../src/services/aqvoraFreshFinanceReadinessService",()=>({
  checkFreshFinanceActivationReadiness:h.read,
}));
import {FreshFinanceReadinessPanel} from
  "../src/components/accounting/FreshFinanceReadinessPanel";

beforeEach(()=>{
  vi.clearAllMocks();h.role="OWNER";h.organizationId=ORG;
  h.isEnabled.mockReturnValue(true);h.read.mockResolvedValue(sample);
});
describe("AQVORA stage-only fresh finance activation readiness panel",()=>{
  it("checks company evidence on demand and NEVER offers activation",async()=>{
    render(<FreshFinanceReadinessPanel/>);
    expect(h.read).not.toHaveBeenCalled();
    expect(screen.queryByText(/Preflight checklist passed/)).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Check readiness"}));
    await waitFor(()=>expect(h.read).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Preflight checklist passed/)).toBeTruthy();
    expect(screen.getByText(/Revision 1/)).toBeTruthy();
    expect(screen.getByText(/Writer activation stays BLOCKED/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/activate|enable.*writer/i})).toBeNull();
    expect(h.read.mock.calls[0][0]).toMatchObject({
      organizationId:ORG,ownerRole:"OWNER",currency:"PKR",
    });
  });
  it("lists real missing accounting configuration and never falsely certifies readiness",async()=>{
    h.read.mockResolvedValue({...sample,blockers:[
      "MISSING_ASSET","CURRENCY_POLICY_UNCONFIGURED",
    ],checklistComplete:false,currencyPolicyRevision:null,postingAccounts:1});
    render(<FreshFinanceReadinessPanel/>);
    fireEvent.click(screen.getByRole("button",{name:"Check readiness"}));
    expect(await screen.findByText(/Setup needs attention/)).toBeTruthy();
    expect(screen.getByText(/Create an active posting asset account/)).toBeTruthy();
    expect(screen.getByText(/Backend-approved currency unit policy is missing/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/activate/i})).toBeNull();
  });
  it("does not treat denied or incomplete RLS data as certified zero",async()=>{
    h.read.mockRejectedValue(new Error("Source inaccessible: MFA required"));
    render(<FreshFinanceReadinessPanel/>);
    fireEvent.click(screen.getByRole("button",{name:"Check readiness"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent",
      expect.stringContaining("MFA required"));
    expect(screen.getByText(/never reported as zero/)).toBeTruthy();
    expect(screen.queryByText(/Preflight checklist passed/)).toBeNull();
  });
  it("hides all review actions from a non-owner or disabled staging",()=>{
    h.role="MANAGER";
    const view=render(<FreshFinanceReadinessPanel/>);
    expect(screen.queryByRole("button",{name:"Check readiness"})).toBeNull();
    h.role="OWNER";h.isEnabled.mockReturnValue(false);
    view.rerender(<FreshFinanceReadinessPanel/>);
    expect(screen.queryByRole("button",{name:"Check readiness"})).toBeNull();
    expect(h.read).not.toHaveBeenCalled();
  });
  it("does not show stale company-A readiness in company-B workspace",async()=>{
    let resolveOld:((value:unknown)=>void)|undefined;
    h.read.mockImplementation(()=>new Promise(resolve=>{resolveOld=resolve;}));
    const view=render(<FreshFinanceReadinessPanel/>);
    fireEvent.click(screen.getByRole("button",{name:"Check readiness"}));
    await waitFor(()=>expect(h.read).toHaveBeenCalledOnce());
    h.organizationId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    view.rerender(<FreshFinanceReadinessPanel/>);
    resolveOld?.(sample);
    await waitFor(()=>expect(screen.queryByText(/Preflight checklist passed/)).toBeNull());
    expect(screen.queryByRole("button",{name:/activate/i})).toBeNull();
  });
});
