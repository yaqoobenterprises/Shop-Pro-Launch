import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
  reserveReceiptPosting,readPendingReceiptPosting,clearPendingReceiptPosting,
} from "../src/accounting/pendingReceiptPosting";
const org="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const receipt="33333333-3333-4333-8333-333333333333";
const intent="44444444-4444-4444-8444-444444444444";
const fp="a".repeat(64);
const storageKey=`aqvora:v2:pending-receipt-post:${org}:${user}`;
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>intent});
});
afterEach(()=>{
  vi.unstubAllGlobals();sessionStorage.clear();
});
describe("AQVORA durable receipt posting recovery",()=>{
  it("reserves one original UUID, revision and fingerprint and restores across reload",()=>{
    const original=reserveReceiptPosting(org,user,receipt,"3",fp);
    expect(original.request).toEqual({
      p_organization_id:org,p_receipt_id:receipt,
      p_expected_revision:"3",p_fingerprint:fp,p_intent_key:intent,
    });
    expect(readPendingReceiptPosting(org,user)).toEqual(original);
    expect(()=>reserveReceiptPosting(org,user,receipt,"3",fp))
      .toThrow(/Resolve original financial posting/);
  });
  it("clears only exact original identity, never modified intent or actor",()=>{
    const original=reserveReceiptPosting(org,user,receipt,"3",fp);
    expect(()=>clearPendingReceiptPosting({
      ...original,request:{...original.request,p_fingerprint:"b".repeat(64)},
    })).toThrow(/changed/);
    expect(readPendingReceiptPosting(org,user)).not.toBeNull();
    clearPendingReceiptPosting(original);
    expect(readPendingReceiptPosting(org,user)).toBeNull();
  });
  it("blocks corrupt or malformed recovered intent instead of allowing new posting",()=>{
    sessionStorage.setItem(storageKey,"{bad-json");
    expect(()=>reserveReceiptPosting(org,user,receipt,"3",fp)).toThrow(/corrupt/);
    sessionStorage.setItem(storageKey,JSON.stringify({
      organizationId:org,userId:user,request:{
        p_organization_id:org,p_receipt_id:receipt,
        p_expected_revision:"0",p_fingerprint:fp,p_intent_key:intent,
      },
    }));
    expect(()=>readPendingReceiptPosting(org,user)).toThrow(/invalid/);
    expect(()=>reserveReceiptPosting(org,user,receipt,"3",fp)).toThrow(/invalid/);
  });
  it("rejects noncanonical revisions, invalid hashes, missing crypto and denied storage",()=>{
    for(const revision of ["0","03","-1","1.5","9223372036854775808"]){
      expect(()=>reserveReceiptPosting(org,user,receipt,revision,fp)).toThrow();
    }
    expect(()=>reserveReceiptPosting(org,user,receipt,"3","fake")).toThrow();
    vi.stubGlobal("crypto",{});
    expect(()=>reserveReceiptPosting(org,user,receipt,"3",fp))
      .toThrow(/generator/);
    vi.stubGlobal("crypto",{randomUUID:()=>intent});
    vi.stubGlobal("sessionStorage",{getItem:()=>null,setItem:()=>{
      throw new Error("Blocked storage");
    }});
    expect(()=>reserveReceiptPosting(org,user,receipt,"3",fp))
      .toThrow(/Blocked storage/);
  });
});
