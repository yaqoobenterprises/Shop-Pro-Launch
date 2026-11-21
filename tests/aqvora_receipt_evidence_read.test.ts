import { describe, expect, it } from "vitest";
import { verifyControlledCashCollection } from "../src/accounting/verifiedCashCollection";
import { verifyCustomerReceiptDetail } from "../src/accounting/verifiedCustomerReceipt";

const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const customer="44444444-4444-4444-8444-444444444444";
const collectionId="55555555-5555-4555-8555-555555555555";
const receiptId="66666666-6666-4666-8666-666666666666";
const invoiceId="77777777-7777-4777-8777-777777777777";
const journal="88888888-8888-4888-8888-888888888888";
const allocation="99999999-9999-4999-8999-999999999999";
const ctx={organizationId:org,customerId:customer,currency:"PKR",asOfDate:"2026-11-20"};
const fp="a".repeat(64);

export const verifiedCashFixture = () => ({
  organization_id:org,id:collectionId,creation_intent:"make-cash-1",
  collection_number:"CC-1",source_kind:"controlled_cash",customer_id:customer,
  business_date:"2026-11-20",currency:"PKR",amount_minor:"100",
  state:"confirmed",revision:"2",created_by:maker,confirmed_by:checker,
  maker_session_fingerprint:fp,checker_session_fingerprint:"b".repeat(64),
  customer_snapshot:{id:customer,name:"Test Customer"},
  policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  fingerprint:"c".repeat(64),created_at:"2026-11-20T08:00:00Z",
  confirmed_at:"2026-11-20T08:01:00Z",cancel_reason:null,
  evidence_method:"dual_control_cash_attestation",
  posted_receipt_id:receiptId,
});
export const verifiedReceiptFixture = () => ({
  organization_id:org,id:receiptId,creation_intent:"draft-1",
  collection_id:collectionId,collection_fingerprint:"c".repeat(64),
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"100",state:"posted",revision:"4",created_by:maker,
  approved_by:checker,policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  fingerprint:"d".repeat(64),journal_id:journal,receipt_number:"CR-1",
  cancel_reason:null,
  allocations:[{invoice_id:invoiceId,amount_minor:"100",
    invoice_revision:"4",invoice_fingerprint:"e".repeat(64)}],
  issue_receipt:{
    organization_id:org,receipt_id:receiptId,collection_id:collectionId,
    source_ref:"CC-1",receipt_number:"CR-1",intent_key:"post-1",
    journal_id:journal,journal_intent_key:`customer-receipt:${journal}`,
    customer_id:customer,business_date:"2026-11-20",currency:"PKR",
    amount_minor:"100",source_revision:"3",posted_revision:"4",
    fingerprint:"d".repeat(64),posted_by:maker,
    posted_at:"2026-11-20T08:02:00Z",
    allocations:[{allocation_id:allocation,invoice_id:invoiceId,
      amount_minor:"100",journal_id:journal,line_no:2}],
    evidence_method:"dual_control_cash_attestation",
  },
  reconciliation:{
    source_complete:true,cash_debit_minor:"100",ar_credit_minor:"100",
    allocated_minor:"100",bank_verified:false,
    evidence_method:"dual_control_cash_attestation",
  },
});

describe("AQVORA controlled cash and posted receipt evidence",()=>{
  it("certifies the shape of manual two-person cash, never bank settlement",()=>{
    const result=verifyControlledCashCollection(verifiedCashFixture(),{
      ...ctx,collectionId,
    });
    expect(result).toMatchObject({
      attestation:"dual_control",bankVerified:false,
      linkedPostedReceiptId:receiptId,
    });
  });

  it("never counts an unconfirmed claim as actual received cash",()=>{
    const draft={...verifiedCashFixture(),state:"draft",revision:"1",
      confirmed_by:null,confirmed_at:null,checker_session_fingerprint:null,
      fingerprint:null,posted_receipt_id:null,evidence_method:"unconfirmed_claim"};
    expect(verifyControlledCashCollection(draft,{...ctx,collectionId}))
      .toMatchObject({attestation:"unconfirmed",bankVerified:false,
        linkedPostedReceiptId:null});
  });

  it("refuses self-confirmation, foreign cash, altered policy and false custody",()=>{
    const c=verifiedCashFixture();
    for (const change of [
      {organization_id:"other"},{confirmed_by:maker},{amount_minor:"0"},
      {currency:"USD"},{collection_number:"CC-0"},
      {maker_session_fingerprint:"not-a-hash"},
      {evidence_method:"bank_verified"},
      {policy_snapshot:{currency:"USD",source_kind:"controlled_cash"}},
      {posted_receipt_id:"forged"},
      {state:"draft",revision:"1",confirmed_by:checker},
    ]) expect(()=>verifyControlledCashCollection({...c,...change},{
      ...ctx,collectionId,
    })).toThrow();
  });

  it("verifies exact Cash debit / AR credit, source receipt and allocation line",()=>{
    const result=verifyCustomerReceiptDetail(verifiedReceiptFixture(),{
      ...ctx,receiptId,
    });
    expect(result.reconciliation).toMatchObject({
      source_complete:true,cash_debit_minor:"100",ar_credit_minor:"100",
      allocated_minor:"100",bank_verified:false,
    });
    expect(result.state).toBe("posted");
  });

  it("treats receipt drafts as unposted financial documents",()=>{
    const {issue_receipt:_issue,reconciliation:_recon,...base}=verifiedReceiptFixture();
    const draft={...base,state:"draft",revision:"1",approved_by:null,
      policy_snapshot:null,fingerprint:null,journal_id:null,receipt_number:null};
    expect(verifyCustomerReceiptDetail(draft,{...ctx,receiptId}).state).toBe("draft");
    expect(()=>verifyCustomerReceiptDetail({...draft,journal_id:journal},{
      ...ctx,receiptId,
    })).toThrow(/Unposted receipt/);
  });

  it("rejects forged value, cross-company, maker-checker, source and journal links",()=>{
    const r=verifiedReceiptFixture();
    for(const change of [
      {organization_id:"elsewhere"},{customer_id:"elsewhere"},
      {state:"paid"},{approved_by:maker},{journal_id:"fake"},
      {amount_minor:"101"},{fingerprint:"bad"},
      {receipt_number:"CR-0"},{revision:"5"},
      {allocations:[{...r.allocations[0],amount_minor:"101"}]},
      {allocations:[r.allocations[0],r.allocations[0]]},
      {reconciliation:{...r.reconciliation,bank_verified:true}},
      {reconciliation:{...r.reconciliation,ar_credit_minor:"99"}},
      {issue_receipt:{...r.issue_receipt,source_revision:"1"}},
      {issue_receipt:{...r.issue_receipt,allocations:[{
        ...r.issue_receipt.allocations[0],line_no:3,
      }]}},
    ]) expect(()=>verifyCustomerReceiptDetail({...r,...change},{
      ...ctx,receiptId,
    })).toThrow();
  });

  it("preserves authoritative receipt and controlled-cash currency evidence",()=>{
    const policy={
      contract_version:"aqvora-currency-policy-v1",status:"configured",
      organization_id:org,transaction_currency:"PKR",ledger_currency:"PKR",
      currency_exponent:2,minor_units_per_major:"100",display_decimal_places:2,
      revision:"1",effective_from:"2026-01-01",fingerprint:fp,
      provenance:{kind:"trusted_company_accounting_policy",
        authority_reference:"synthetic",authority_revision:"1",
        approval_reference:"approved-test",approved_by:checker},
      source_rounding:"quantity_millionths_half_up_per_line_v1",fx_supported:false,
    };
    const c={...verifiedCashFixture(),currency_policy:policy};
    const r=verifiedReceiptFixture();
    const linked={...r,currency_policy:policy,issue_receipt:{
      ...r.issue_receipt,currency_policy:policy,
    }};
    expect(verifyControlledCashCollection(c,{...ctx,collectionId}).collection.currency_policy)
      .toEqual(policy);
    expect(verifyCustomerReceiptDetail(linked,{...ctx,receiptId}).currency_policy)
      .toEqual(policy);
    for(const bad of [
      {...policy,organization_id:customer},
      {...policy,minor_units_per_major:"1"},
      {...policy,effective_from:"2026-11-21"},
    ]){
      expect(()=>verifyControlledCashCollection({
        ...c,currency_policy:bad,
      },{...ctx,collectionId})).toThrow();
      expect(()=>verifyCustomerReceiptDetail({
        ...linked,currency_policy:bad,
      },{...ctx,receiptId})).toThrow();
    }
    expect(()=>verifyCustomerReceiptDetail({
      ...linked,issue_receipt:{...linked.issue_receipt,
        currency_policy:{...policy,fingerprint:"e".repeat(64)}},
    },{...ctx,receiptId})).toThrow(/policy changed/);
    expect(()=>verifyCustomerReceiptDetail({
      ...linked,issue_receipt:r.issue_receipt,
    },{...ctx,receiptId})).toThrow(/policy changed/);
  });

  it("refuses future-dated/corrupt receipts and noncanonical source money",()=>{
    const r=verifiedReceiptFixture();
    for(const change of [
      {business_date:"2026-11-21"},{business_date:"2026-02-30"},
      {amount_minor:"100.00"},{amount_minor:"9223372036854775808"},
    ]) expect(()=>verifyCustomerReceiptDetail({...r,...change},{
      ...ctx,receiptId,
    })).toThrow();
  });
});
