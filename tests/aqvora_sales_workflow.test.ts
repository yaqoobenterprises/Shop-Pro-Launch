// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {salesHarness,salesFixtureSql,serviceLines,readIds as i,ar} from "./support/aqvoraSalesFixture";
import type {TrialBalancePage,GeneralLedgerPage} from "../src/accounting/readContracts";
describe("Verified service invoice lifecycle and AR posting",()=>{
  const h=salesHarness(); let customer:string;
  beforeAll(async()=>h.db.exec(salesFixtureSql()));
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();customer=await h.customer();});
  afterEach(async()=>h.db.exec("ROLLBACK; RESET ROLE"));
  afterAll(async()=>h.db.close());
  it("keeps drafts unposted and records every version through separate maker/checker issuance",async()=>{
    const draft=await h.draft(customer);
    expect(draft).toMatchObject({state:"draft",revision:"1",face_minor:"101",fingerprint:null,journal_id:null});
    expect((await h.query("SELECT * FROM public.aqvora_journals")).rows).toHaveLength(0);
    const approved=await h.approve(draft);expect(approved).toMatchObject({state:"approved",revision:"3"});
    const receipt=await h.issue(approved);
    expect(receipt).toMatchObject({invoice_id:draft.id,document_number:"SI-1",face_minor:"101",source_revision:"3"});
    expect(await h.get(draft.id)).toMatchObject({state:"issued",revision:"4",journal_id:receipt.journal_id,
      reconciliation:{face_minor:"101",ar_debit_minor:"101",revenue_credit_minor:"101"}});
    const tb=(await h.query<{r:TrialBalancePage}>("SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') r",[i.org])).rows[0].r;
    expect(tb.totals).toMatchObject({debit_minor:"101",credit_minor:"101",closing_debit_minor:"101",closing_credit_minor:"101"});
    const gl=(await h.query<{r:GeneralLedgerPage}>("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR',100,null,$3) r",
      [i.org,ar,tb.source.snapshot_token])).rows[0].r;
    expect(gl.rows[0]).toMatchObject({journal_id:receipt.journal_id,party_id:customer,open_item_id:draft.id,debit_minor:"101"});
    const events=(await h.query<{r:Array<{action:string;revision:string}>}>("SELECT public.list_aqvora_sales_audit($1,$2) r",[i.org,draft.id])).rows[0].r;
    expect(events.map(e=>e.action)).toEqual(["CREATE","SUBMIT","APPROVE","ISSUE"]);
    expect(events.map(e=>e.revision)).toEqual(["1","2","3","4"]);
  });
  it("recovers lost acknowledgments exactly, rejects changed intent payloads and blocks a second issue intent",async()=>{
    const approved=await h.approve(await h.draft(customer));const key=h.key();const first=await h.issue(approved,key);
    expect(await h.issue(approved,key)).toEqual(first);
    expect((await h.query<{r:unknown}>("SELECT public.lookup_aqvora_sales_issue($1,$2) r",[i.org,key])).rows[0].r).toEqual(first);
    await expect(h.issue(approved,key,"0".repeat(64))).rejects.toThrow("idempotency");
    await expect(h.issue(approved)).rejects.toThrow("immutable");
    await h.db.exec("RESET ROLE");
    expect((await h.query("SELECT * FROM public.aqvora_journals")).rows).toHaveLength(1);
    expect((await h.query("SELECT * FROM private.aqvora_sales_numbers")).rows[0]).toMatchObject({last_number:1});
  });
  it("keeps whole invoice values exact at the signed 64-bit boundary",async()=>{
    const approved=await h.approve(await h.draft(customer,[{...serviceLines[0],unit_price_minor:"9223372036854775807"}]));
    expect((await h.issue(approved)).face_minor).toBe("9223372036854775807");
    expect((await h.get(approved.id)).face_minor).toBe("9223372036854775807");
  });
  it("uses quantity-millionths and per-line positive half-up rounding with explicit discounts",async()=>{
    const d=await h.draft(customer,[{...serviceLines[0],quantity_millionths:"1500000",unit_price_minor:"101",discount_minor:"2"}]);
    expect(d).toMatchObject({gross_minor:"152",discount_minor:"2",face_minor:"150"});
    expect((await h.issue(await h.approve(d))).face_minor).toBe("150");
  });
  it("supports maker-only full draft replacement and rejects stale revisions",async()=>{
    const d=await h.draft(customer);
    const edit=()=>h.query<{r:{revision:string;face_minor:string}}>(
      "SELECT public.edit_aqvora_sales_draft($1,$2,$3,$4,'2026-11-20','2026-12-20','PKR',$5::jsonb) r",
      [i.org,d.id,d.revision,customer,JSON.stringify([{...serviceLines[0],unit_price_minor:"202"}])]);
    await h.user(i.owner);await expect(edit()).rejects.toThrow("not owned");await h.user();
    expect((await edit()).rows[0].r).toMatchObject({revision:"2",face_minor:"202"});
    await expect(edit()).rejects.toThrow("stale");
  });
  it("rejects and resubmits with a new revision and cancels only before issuance",async()=>{
    const submitted=await h.transition(await h.draft(customer),"submit");await h.user(i.owner);
    await expect(h.transition(submitted,"reject")).rejects.toThrow("reason");
    const rejected=await h.transition(submitted,"reject","Correct service detail");
    expect(rejected).toMatchObject({state:"draft",fingerprint:null,revision:"3"});
    await h.user();const approved=await h.approve(rejected);
    const cancelled=await h.transition(approved,"cancel","Customer withdrew order");
    expect(cancelled.state).toBe("cancelled");await expect(h.issue(cancelled)).rejects.toThrow("immutable");
    await expect(h.transition(cancelled,"cancel","Again")).rejects.toThrow("immutable");
    expect((await h.query("SELECT * FROM public.aqvora_journals")).rows).toHaveLength(0);
  });
  it("protects issued invoice/journal/receipts/audit and strictly blocks generic financial reversal",async()=>{
    const approved=await h.approve(await h.draft(customer));const receipt=await h.issue(approved);
    await expect(h.transition(await h.get(approved.id),"cancel","Correction")).rejects.toThrow("immutable");
    await expect(h.query("SELECT public.reverse_aqvora_journal($1,$2,'not-a-credit','2026-11-21','Correction')",[i.org,receipt.journal_id])).rejects.toThrow("linked credit");
    await h.db.exec("RESET ROLE");
    for(const sql of ["UPDATE public.aqvora_sales_invoices SET face_minor=1 WHERE id=$1",
      "DELETE FROM public.aqvora_sales_invoices WHERE id=$1","UPDATE public.aqvora_sales_issue_receipts SET request='{}' WHERE invoice_id=$1",
      "DELETE FROM public.aqvora_sales_audit WHERE entity_id=$1"]) await expect(h.query(sql,[approved.id])).rejects.toThrow("immutable");
  });
  it("returns a verified empty source and deterministic scoped document/audit pages",async()=>{
    expect((await h.query<{r:unknown[]}>("SELECT public.list_aqvora_sales_invoices($1) r",[i.org])).rows[0].r).toEqual([]);
    const a=await h.draft(customer);const b=await h.draft(customer);
    const page=(await h.query<{r:Array<{id:string}>}>("SELECT public.list_aqvora_sales_invoices($1,null,1) r",[i.org])).rows[0].r;
    const next=(await h.query<{r:Array<{id:string}>}>("SELECT public.list_aqvora_sales_invoices($1,$2,1) r",[i.org,page[0].id])).rows[0].r;
    expect([page[0].id,next[0].id]).toEqual([a.id,b.id].sort());
  });
});
