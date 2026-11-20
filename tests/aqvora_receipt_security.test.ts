// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {receiptHarness,receiptFixtureSql,readIds as i} from "./support/aqvoraReceiptFixture";
describe("Receipt source and allocation security boundaries",()=>{
  const h=receiptHarness();let customer:string;
  beforeAll(async()=>h.db.exec(receiptFixtureSql()));
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();customer=await h.customer();});
  afterEach(async()=>h.db.exec("ROLLBACK;RESET ROLE"));afterAll(async()=>h.db.close());
  it.each(["0","-1","01","1.00","1e2","9223372036854775808",0,1,1.5,true,null,{verified:true}])("rejects untrusted money %j",async(amount)=>{
    await expect(h.cash(customer,amount)).rejects.toThrow();
    await h.db.exec("RESET ROLE");expect((await h.query("SELECT * FROM public.aqvora_cash_collections")).rows).toHaveLength(0);
  });
  it("blocks bank claims, unknown policy, future dates and mismatched company currency",async()=>{
    await expect(h.cash(customer,"1","2026-11-20",h.key(),"bank_deposit")).rejects.toThrow("bank");
    await expect(h.cash(customer,"1","9999-01-01")).rejects.toThrow("future");
    await expect(h.query("SELECT public.create_aqvora_cash_collection($1,'currency',$2,'2026-11-20','USD','\"1\"','controlled_cash')",[i.org,customer])).rejects.toThrow("currency");
    await h.db.exec("RESET ROLE");await h.query("UPDATE private.aqvora_receipt_policies SET is_active=false WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.cash(customer)).rejects.toThrow("policy");
  });
  it("requires explicit distinct OWNER cash counting and blocks an amount mismatch",async()=>{
    const c=await h.cash(customer,"40");
    const confirm=(amount="40",attestation="cash_counted_in_person")=>h.query("SELECT public.confirm_aqvora_cash_collection($1,$2,1,$3::jsonb,$4)",[i.org,c.id,JSON.stringify(amount),attestation]);
    await expect(confirm()).rejects.toThrow("OWNER");await h.user(i.owner);
    await expect(confirm("39")).rejects.toThrow("differs");await expect(confirm("40","verified=true")).rejects.toThrow("attestation");
    const owned=await h.cash(customer,"1");await expect(h.confirm(owned)).rejects.toThrow("self-confirmed");
  });
  it("deduplicates creation intents and does not consume another collection number on replay",async()=>{
    const key=h.key();const c=await h.cash(customer,"40","2026-11-20",key);
    expect((await h.cash(customer,"40","2026-11-20",key)).id).toBe(c.id);
    await expect(h.cash(customer,"41","2026-11-20",key)).rejects.toThrow("idempotency");
    await h.db.exec("RESET ROLE");expect((await h.query("SELECT last_number::text n FROM private.aqvora_receipt_numbers WHERE organization_id=$1 AND kind='collection'",[i.org])).rows[0]).toEqual({n:"1"});
  });
  it("rejects duplicate, zero, foreign, unissued and cross-customer invoice allocations",async()=>{
    const invoice=await h.invoice(customer);const otherCustomer=await h.customer();const otherInvoice=await h.invoice(otherCustomer);
    const draft=await h.draft(customer);const c=await h.confirm(await h.cash(customer,"101"));
    for(const allocations of [[],[{invoice_id:invoice.id,amount_minor:"0"}],
      [{invoice_id:invoice.id,amount_minor:"50"},{invoice_id:invoice.id,amount_minor:"51"}],
      [{invoice_id:otherInvoice.id,amount_minor:"101"}],[{invoice_id:draft.id,amount_minor:"101"}],
      [{invoice_id:i.foreign,amount_minor:"101"}],[{invoice_id:invoice.id,amount_minor:101}],
      [{invoice_id:invoice.id,amount_minor:"101",verified:true}]]) await expect(h.draftReceipt(c,allocations)).rejects.toThrow();
  });
  it("rejects nonmatching instrument sums and global instrument reuse across independent intents",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"101"));
    await expect(h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"100"}])).rejects.toThrow("equal the instrument");
    const key=h.key();const d=await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"101"}],key);
    expect((await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"101"}],key)).id).toBe(d.id);
    await expect(h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"101"}])).rejects.toThrow("unique");
    const approved=await h.approveReceipt(d);await h.postReceipt(approved);
    await expect(h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"101"}])).rejects.toThrow();
  });
  it("supports audited rejection/cancellation and fresh allocations without cancelling confirmed cash",async()=>{
    const a=await h.invoice(customer);const b=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"40"));
    const original=await h.draftReceipt(c,[{invoice_id:a.id,amount_minor:"40"}]);
    const submitted=await h.receiptTransition(original,"submit");await h.user(i.owner);
    const rejected=await h.receiptTransition(submitted,"reject","Choose another invoice");await h.user();
    const edit=()=>h.query<{r:typeof rejected}>("SELECT public.edit_aqvora_customer_receipt_draft($1,$2,$3,$4::jsonb) r",[i.org,rejected.id,rejected.revision,JSON.stringify([{invoice_id:b.id,amount_minor:"40"}])]);
    const edited=(await edit()).rows[0].r;await expect(edit()).rejects.toThrow("stale");
    await h.receiptTransition(edited,"cancel","Replace allocation request");
    const replacement=await h.draftReceipt(c,[{invoice_id:a.id,amount_minor:"40"}]);expect(replacement.id).not.toBe(original.id);
    await expect(h.query("SELECT public.cancel_aqvora_cash_collection($1,$2,2,'Refund')",[i.org,c.id])).rejects.toThrow("immutable");
  });
  it("denies guessed tenant sources, AAL1, inactive/demoted members and revoked sessions",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const d=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));
    await h.user(i.outsider);await expect(h.postReceipt(d)).rejects.toThrow("not authorized");
    await expect(h.openBalance(invoice.id)).rejects.toThrow("MFA");await h.user(i.cashier);await expect(h.cash(customer)).rejects.toThrow("not authorized");
    await h.user(i.manager,"aal1");await expect(h.postReceipt(d)).rejects.toThrow("MFA");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2",[i.org,i.manager]);
    await h.user();await expect(h.postReceipt(d)).rejects.toThrow("not authorized");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET is_active=true,role='CASHIER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.manager]);
    await h.user();await expect(h.postReceipt(d)).rejects.toThrow("not authorized");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.manager]);
    await h.query("DELETE FROM auth.sessions WHERE user_id=$1",[i.manager]);await h.user();await expect(h.postReceipt(d)).rejects.toThrow("revoked");
  });
  it("rechecks checker role, fiscal closure and enrollment while preserving committed recovery",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const d=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.owner]);
    await h.user();await expect(h.postReceipt(d)).rejects.toThrow("checker");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET role='OWNER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.owner]);
    await h.query("UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.postReceipt(d)).rejects.toThrow("closed");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.aqvora_periods SET state='open' WHERE organization_id=$1",[i.org]);
    await h.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);await h.user();await expect(h.postReceipt(d)).rejects.toThrow("not enabled");
    await h.db.exec("RESET ROLE");await h.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)",[i.org]);await h.user();
    const key=h.key();const receipt=await h.postReceipt(d,key);
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1",[i.org]);
    await h.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);await h.user();expect(await h.postReceipt(d,key)).toEqual(receipt);
  });
  it("blocks direct source access, generic reversal and privileged mutation of posted history",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const d=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));const posted=await h.postReceipt(d);
    await expect(h.query("SELECT public.reverse_aqvora_journal($1,$2,'fake-refund','2026-11-20','Refund')",[i.org,posted.journal_id])).rejects.toThrow("linked credit/refund");
    for(const table of ["aqvora_cash_collections","aqvora_customer_receipts","aqvora_receipt_allocations","aqvora_receipt_issues","aqvora_receipt_audit"]){
      await expect(h.query(`SELECT * FROM public.${table}`)).rejects.toThrow("permission");
      await expect(h.query(`DELETE FROM public.${table}`)).rejects.toThrow("permission");}
    await expect(h.query("SELECT private.aqvora_customer_receipt_source_valid($1,$2)",[i.org,d.id])).rejects.toThrow("permission");
    await h.db.exec("RESET ROLE");for(const sql of ["UPDATE public.aqvora_cash_collections SET amount_minor=2",
      "DELETE FROM public.aqvora_customer_receipts","UPDATE public.aqvora_receipt_allocations SET amount_minor=2",
      "DELETE FROM public.aqvora_receipt_issues","DELETE FROM public.aqvora_receipt_audit"])await expect(h.query(sql)).rejects.toThrow("immutable");
    await h.db.exec("SET ROLE anon");await expect(h.openBalance(invoice.id)).rejects.toThrow("permission");
  });
  it("prevents customer archival from stranding pending cash and retains archived posted history",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));await h.user(i.owner);
    await expect(h.query("SELECT public.archive_aqvora_customer($1,$2,1,'Archive')",[i.org,customer])).rejects.toThrow("pending cash");
    await h.user();await h.postReceipt(await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}])));
    await h.user(i.owner);await h.query("SELECT public.archive_aqvora_customer($1,$2,1,'Archive')",[i.org,customer]);await h.user();
    expect(await h.openBalance(invoice.id)).toMatchObject({allocated_minor:"1",outstanding_minor:"100"});
    await expect(h.cash(customer,"1")).rejects.toThrow("customer");
  });
  it("fails closed on an injected audit event even when the original ledger remains balanced",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const d=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));await h.postReceipt(d);
    await h.db.exec("RESET ROLE");
    await h.query(`INSERT INTO public.aqvora_receipt_audit(organization_id,entity_type,entity_id,revision,action,actor_id,after_row)
      VALUES($1,'receipt',$2,5,'EDIT',$3,'{}')`,[i.org,d.id,i.owner]);await h.user();
    await expect(h.openBalance(invoice.id)).rejects.toThrow("inconsistent");
    await expect(h.query("SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR')",[i.org])).rejects.toThrow("inconsistent");
  });
  it.each(["allocation","issue","cash_audit"])("fails closed on missing %s evidence in invoice point reads and GL/TB",async(kind)=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const d=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));await h.postReceipt(d);
    await h.db.exec("RESET ROLE");
    const table=kind==="allocation"?"aqvora_receipt_allocations":kind==="issue"?"aqvora_receipt_issues":"aqvora_receipt_audit";
    await h.db.exec(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
    await h.query(`DELETE FROM public.${table}`);await h.db.exec(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);await h.user();
    await expect(h.openBalance(invoice.id)).rejects.toThrow("inconsistent");
    await expect(h.query("SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR')",[i.org])).rejects.toThrow("inconsistent");
  });
  it("rejects a receipt earlier than its invoice and allocations beyond the journal line bound",async()=>{
    const invoice=await h.invoice(customer);const early=await h.confirm(await h.cash(customer,"1","2026-11-17"));
    await expect(h.draftReceipt(early,[{invoice_id:invoice.id,amount_minor:"1"}])).rejects.toThrow("later");
    const c=await h.confirm(await h.cash(customer,"100"));
    await expect(h.draftReceipt(c,Array.from({length:100},()=>({invoice_id:invoice.id,amount_minor:"1"})))).rejects.toThrow("1-99");
  });
  it("rejects broken earlier approval history before creating a journal",async()=>{
    const invoice=await h.invoice(customer);const c=await h.confirm(await h.cash(customer,"1"));
    const r=await h.approveReceipt(await h.draftReceipt(c,[{invoice_id:invoice.id,amount_minor:"1"}]));
    await h.db.exec("RESET ROLE;ALTER TABLE public.aqvora_receipt_audit DISABLE TRIGGER USER");
    await h.query("UPDATE public.aqvora_receipt_audit SET after_row='{}' WHERE entity_type='receipt' AND entity_id=$1 AND revision=1",[r.id]);
    await h.db.exec("ALTER TABLE public.aqvora_receipt_audit ENABLE TRIGGER USER");await h.user();
    await expect(h.postReceipt(r)).rejects.toThrow("approval audit");
    await h.db.exec("RESET ROLE");expect((await h.query("SELECT count(*)::int n FROM public.aqvora_journals WHERE source_kind='customer_receipt'")).rows[0].n).toBe(0);
  });
});
