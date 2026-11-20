// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {receiptHarness,receiptFixtureSql,readIds as i,receiptCash,ar} from "./support/aqvoraReceiptFixture";
import type {GeneralLedgerPage,TrialBalancePage} from "../src/accounting/readContracts";
describe("Controlled cash → verified AR settlement",()=>{
  const h=receiptHarness();let customer:string;
  beforeAll(async()=>h.db.exec(receiptFixtureSql()));
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();customer=await h.customer();});
  afterEach(async()=>h.db.exec("ROLLBACK;RESET ROLE"));afterAll(async()=>h.db.close());
  it("keeps unconfirmed claims and unposted receipt drafts out of financial balances",async()=>{
    const invoice=await h.invoice(customer);const claim=await h.cash(customer,"40");
    await expect(h.draftReceipt(claim,[{invoice_id:invoice.id,amount_minor:"40"}])).rejects.toThrow("confirmed");
    const c=await h.confirm(claim);const draft=await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"40"}]);
    expect(draft).toMatchObject({state:"draft",revision:"1",amount_minor:"40",fingerprint:null});
    expect(await h.openBalance(invoice.id)).toMatchObject({face_minor:"101",allocated_minor:"0",outstanding_minor:"101",status:"unpaid"});
  });
  it("posts a partial receipt once, preserves revenue and reconciles GL/TB and customer AR",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"40"));
    const approved=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"40"}]));
    const receipt=await h.postReceipt(approved);
    expect(receipt).toMatchObject({receipt_number:"CR-1",source_ref:"CC-1",amount_minor:"40"});
    expect(receipt.allocations).toHaveLength(1);expect(receipt.allocations[0].allocation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await h.openBalance(invoice.id)).toMatchObject({allocated_minor:"40",outstanding_minor:"61",status:"partial"});
    expect(await h.openBalance(invoice.id,"2026-11-19")).toMatchObject({allocated_minor:"0",outstanding_minor:"101"});
    const tb=(await h.query<{r:TrialBalancePage}>("SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') r",[i.org])).rows[0].r;
    expect(tb.totals).toMatchObject({debit_minor:"141",credit_minor:"141",closing_debit_minor:"101",closing_credit_minor:"101"});
    const gl=(await h.query<{r:GeneralLedgerPage}>("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR',100,null,$3) r",[i.org,ar,tb.source.snapshot_token])).rows[0].r;
    expect(gl).toMatchObject({debit_minor:"101",credit_minor:"40",closing_minor:"61"});
    expect(gl.rows.find(r=>r.journal_id===receipt.journal_id)).toMatchObject({source_kind:"customer_receipt",source_id:approved.id,party_id:customer,open_item_id:invoice.id});
    const recon=(await h.query<{r:Record<string,string>}>("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20',$2) r",[i.org,customer])).rows[0].r;
    expect(recon).toMatchObject({face_minor:"101",allocated_minor:"40",outstanding_minor:"61",ar_control_minor:"61"});
    expect((await h.get(invoice.id)).reconciliation).toMatchObject({face_minor:"101",ar_debit_minor:"101",revenue_credit_minor:"101"});
    const revenue=(await h.query<{r:GeneralLedgerPage}>("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR') r",[i.org,i.sales])).rows[0].r;
    expect(revenue.credit_minor).toBe("101");expect(revenue.rows).toHaveLength(1);
  });
  it("allocates one collection across multiple invoices and fully settles them atomically",async()=>{
    const a=await h.invoice(customer,"101");const b=await h.invoice(customer,"202");
    const cash=await h.confirm(await h.cash(customer,"303"));
    const d=await h.approveReceipt(await h.draftReceipt(cash,[{invoice_id:b.id,amount_minor:"202"},{invoice_id:a.id,amount_minor:"101"}]));
    const receipt=await h.postReceipt(d);expect(receipt.allocations).toHaveLength(2);
    expect(await h.openBalance(a.id)).toMatchObject({allocated_minor:"101",outstanding_minor:"0",status:"settled"});
    expect(await h.openBalance(b.id)).toMatchObject({allocated_minor:"202",outstanding_minor:"0",status:"settled"});
    const recon=(await h.query<{r:Record<string,string>}>("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20') r",[i.org])).rows[0].r;
    expect(recon).toMatchObject({face_minor:"303",allocated_minor:"303",outstanding_minor:"0",ar_control_minor:"0",scope:"company"});
  });
  it("supports successive partial receipts and exact closing without touching immutable invoice revisions",async()=>{
    const invoice=await h.invoice(customer);
    for(const amount of ["40","61"]){const c=await h.confirm(await h.cash(customer,amount));
      await h.postReceipt(await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:amount}])));}
    expect(await h.openBalance(invoice.id)).toMatchObject({face_minor:"101",allocated_minor:"101",outstanding_minor:"0"});
    expect((await h.get(invoice.id)).revision).toBe(invoice.revision);
    const c=await h.confirm(await h.cash(customer,"1"));
    await expect(h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}])).rejects.toThrow("over-allocation");
  });
  it("returns durable exact retries after lost ACK and rejects changed payloads or another issue intent",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"101"));
    const approved=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"101"}]));
    const key=h.key();const first=await h.postReceipt(approved,key);expect(await h.postReceipt(approved,key)).toEqual(first);
    expect((await h.query<{r:unknown}>("SELECT public.lookup_aqvora_customer_receipt_issue($1,$2) r",[i.org,key])).rows[0].r).toEqual(first);
    await expect(h.postReceipt(approved,key,"0".repeat(64))).rejects.toThrow("idempotency");await expect(h.postReceipt(approved)).rejects.toThrow("immutable");
  });
  it("keeps maximum BIGINT collections exact and sums company receipts beyond BIGINT",async()=>{
    for(let n=0;n<2;n++){const invoice=await h.invoice(customer,"9223372036854775807");const c=await h.confirm(await h.cash(customer,"9223372036854775807"));
      const receipt=await h.postReceipt(await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"9223372036854775807"}])));
      expect(receipt.amount_minor).toBe("9223372036854775807");}
    const recon=(await h.query<{r:Record<string,string>}>("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20') r",[i.org])).rows[0].r;
    expect(recon).toMatchObject({face_minor:"18446744073709551614",allocated_minor:"18446744073709551614",outstanding_minor:"0"});
    const cash=(await h.query<{r:GeneralLedgerPage}>("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR') r",[i.org,receiptCash])).rows[0].r;
    expect(cash.closing_minor).toBe("18446744073709551614");
  });
});
