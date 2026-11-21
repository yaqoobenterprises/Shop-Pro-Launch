import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
  clearPendingSalesIssue,loadPendingSalesIssue,reserveSalesIssue,
} from "../src/accounting/pendingSalesIssue";

const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const other="33333333-3333-4333-8333-333333333333";
const invoice="44444444-4444-4444-8444-444444444444";
const key="55555555-5555-4555-8555-555555555555";
const fp="a".repeat(64);
const storageKey=`aqvora:v2:pending-sales-issue:${org}:${actor}`;
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>key});
});
afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();});
describe("AQVORA financial issue original intent durability",()=>{
  it("reserves a cryptographically sourced intent and reads the exact same original after page reload",()=>{
    const a=reserveSalesIssue(org,actor,invoice,"3",fp);
    expect(a.intentKey).toBe(key);
    expect(loadPendingSalesIssue(org,actor)).toEqual(a);
  });
  it("refuses any second financial issue until original is recovered",()=>{
    reserveSalesIssue(org,actor,invoice,"3",fp);
    expect(()=>reserveSalesIssue(org,actor,other,"4",fp))
      .toThrow(/Resolve the original pending issue/);
    expect(loadPendingSalesIssue(org,actor)?.invoiceId).toBe(invoice);
  });
  it("refuses damaged or foreign persisted recovery instead of generating new keys",()=>{
    sessionStorage.setItem(storageKey,"not-json");
    expect(()=>reserveSalesIssue(org,actor,invoice,"3",fp)).toThrow(/corrupted/);
    sessionStorage.setItem(storageKey,JSON.stringify({
      organizationId:other,userId:actor,invoiceId:invoice,revision:"3",
      fingerprint:fp,intentKey:key,
    }));
    expect(()=>loadPendingSalesIssue(org,actor)).toThrow(/invalid/);
  });
  it("only clears the matching recovered receipt, not another company's pending key",()=>{
    const a=reserveSalesIssue(org,actor,invoice,"3",fp);
    expect(()=>clearPendingSalesIssue({...a,intentKey:other})).toThrow(/changed/);
    expect(loadPendingSalesIssue(org,actor)).not.toBeNull();
    clearPendingSalesIssue(a);
    expect(loadPendingSalesIssue(org,actor)).toBeNull();
  });
  it("blocks posting if durable storage fails instead of losing the idempotency key",()=>{
    const storage={
      getItem:()=>null,setItem:()=>{throw new Error("Storage unavailable");},
    };
    vi.stubGlobal("sessionStorage",storage);
    expect(()=>reserveSalesIssue(org,actor,invoice,"3",fp))
      .toThrow(/Storage unavailable/);
  });
});
