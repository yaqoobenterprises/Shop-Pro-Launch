import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
  reservePendingCashClaim, readPendingCashClaim, clearPendingCashClaim,
} from "../src/accounting/pendingCashClaim";
const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const original="44444444-4444-4444-8444-444444444444";
const request={
  p_organization_id:org,p_customer_id:customer,
  p_business_date:"2026-11-20",p_currency:"PKR",
  p_amount_minor:"100",p_source_kind:"controlled_cash" as const,
};
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>original});
});
afterEach(()=>{
  vi.unstubAllGlobals();sessionStorage.clear();
});
describe("AQVORA original controlled cash claim recovery",()=>{
  it("retains original exact amount/customer/date and UUID across reload",()=>{
    const pending=reservePendingCashClaim(org,actor,request);
    expect(pending.request.p_intent_key).toBe(original);
    expect(readPendingCashClaim(org,actor)).toEqual(pending);
    expect(pending.request.p_amount_minor).toBe("100");
  });
  it("blocks second intent while first request has uncertain response",()=>{
    reservePendingCashClaim(org,actor,request);
    expect(()=>reservePendingCashClaim(org,actor,{...request,p_amount_minor:"200"}))
      .toThrow(/Resolve the original/);
  });
  it("refuses tampered/fake original record and corrupted JSON rather than new claim",()=>{
    const key=`aqvora:v2:cash-claim:${org}:${actor}`;
    sessionStorage.setItem(key,"not-json");
    expect(()=>reservePendingCashClaim(org,actor,request)).toThrow(/corrupt/);
    sessionStorage.setItem(key,JSON.stringify({
      userId:actor,request:{...request,p_organization_id:customer,p_intent_key:original},
    }));
    expect(()=>readPendingCashClaim(org,actor)).toThrow(/invalid/);
  });
  it("clears only the matched source, never a different actor or intent",()=>{
    const pending=reservePendingCashClaim(org,actor,request);
    expect(()=>clearPendingCashClaim({...pending,request:{
      ...pending.request,p_intent_key:customer,
    }})).toThrow(/changed/);
    expect(readPendingCashClaim(org,actor)).not.toBeNull();
    clearPendingCashClaim(pending);
    expect(readPendingCashClaim(org,actor)).toBeNull();
  });
  it("blocks cash creation rather than forgetting the intent if storage is denied",()=>{
    const storage={getItem:()=>null,setItem:()=>{throw new Error("Storage denied");}};
    vi.stubGlobal("sessionStorage",storage);
    expect(()=>reservePendingCashClaim(org,actor,request))
      .toThrow(/Storage denied/);
  });
});
