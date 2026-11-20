// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {receiptHarness,receiptFixtureSql,readIds as i} from "./support/aqvoraReceiptFixture";
type Page={rows:Array<{invoice_id:string;outstanding_minor:string}>;has_more:boolean;next_after_id:string|null;source:{snapshot_token:string};matched_count:string};
describe("Certified receipt read contracts",()=>{
  const h=receiptHarness();let customer:string;
  beforeAll(async()=>h.db.exec(receiptFixtureSql()));
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();customer=await h.customer();});
  afterEach(async()=>h.db.exec("ROLLBACK;RESET ROLE"));afterAll(async()=>h.db.close());
  const page=async(after:string|null=null,token:string|null=null)=>(await h.query<{r:Page}>(
    "SELECT public.list_aqvora_open_invoices($1,$2,'PKR','2026-11-20',$3,1,$4) r",[i.org,customer,after,token])).rows[0].r;
  it("returns explicit zero reconciliations and empty pages for an empty company",async()=>{
    expect(await page()).toMatchObject({rows:[],matched_count:"0",has_more:false,next_after_id:null});
    expect((await h.query("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20') r",[i.org])).rows[0].r)
      .toMatchObject({face_minor:"0",allocated_minor:"0",outstanding_minor:"0",ar_control_minor:"0",invoice_count:"0",aging_supported:false});
    expect((await h.query("SELECT public.list_aqvora_cash_collections($1) r",[i.org])).rows[0].r).toEqual([]);
    expect((await h.query("SELECT public.list_aqvora_customer_receipts($1) r",[i.org])).rows[0].r).toEqual([]);
    expect((await h.query("SELECT public.lookup_aqvora_customer_receipt_issue($1,'unknown') r",[i.org])).rows[0].r).toBeNull();
  });
  it("paginates by immutable UUID with a certified snapshot and requires restart after posting",async()=>{
    const invoices=[await h.invoice(customer),await h.invoice(customer),await h.invoice(customer)];
    const first=await page();expect(first).toMatchObject({matched_count:"3",has_more:true});
    await expect(page(first.next_after_id)).rejects.toThrow("snapshot");
    const second=await page(first.next_after_id,first.source.snapshot_token);const third=await page(second.next_after_id,first.source.snapshot_token);
    expect(third.has_more).toBe(false);expect(new Set([...first.rows,...second.rows,...third.rows].map(r=>r.invoice_id)).size).toBe(3);
    expect([...first.rows,...second.rows,...third.rows].map(r=>r.invoice_id)).toEqual(invoices.map(r=>r.id).sort());
    const c=await h.confirm(await h.cash(customer));await h.postReceipt(await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoices[0].id,amount_minor:"101"}])));
    await expect(page(first.next_after_id,first.source.snapshot_token)).rejects.toThrow(/changed|snapshot/i);
    expect((await page()).matched_count).toBe("2");
  });
  it("exposes immutable source audit and pending evidence without calling it a posted balance",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const r=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));await h.postReceipt(r);
    expect((await h.query("SELECT public.get_aqvora_customer_receipt($1,$2) r",[i.org,r.id])).rows[0].r.reconciliation)
      .toMatchObject({source_complete:true,bank_verified:false,evidence_method:"dual_control_cash_attestation",allocated_minor:"1"});
    const audit=(await h.query("SELECT public.list_aqvora_receipt_audit($1,'receipt',$2,0,2) r",[i.org,r.id])).rows[0].r;
    expect(audit.map((a:{action:string})=>a.action)).toEqual(["CREATE","SUBMIT"]);
    expect(typeof audit[0].id).toBe("string");
    const next=(await h.query("SELECT public.list_aqvora_receipt_audit($1,'receipt',$2,$3) r",[i.org,r.id,audit[1].id])).rows[0].r;
    expect(next.map((a:{action:string})=>a.action)).toEqual(["APPROVE","POST"]);
    expect((await h.query("SELECT public.get_aqvora_cash_collection($1,$2) r",[i.org,c.id])).rows[0].r.posted_receipt_id).toBe(r.id);
    await expect(h.openBalance(invoice.id,"2026-11-17")).rejects.toThrow("cutoff");
    for(const limit of [0,201])await expect(h.query("SELECT public.list_aqvora_customer_receipts($1,null,$2)",[i.org,limit])).rejects.toThrow("page size");
  });
});
