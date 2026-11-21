// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {salesHarness,salesFixtureSql,serviceLines,readIds as i,ar} from "./support/aqvoraSalesFixture";
describe("Sales source authorization and fail-closed verification",()=>{
  const h=salesHarness();let customer:string;
  beforeAll(async()=>h.db.exec(salesFixtureSql()));
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();customer=await h.customer();});
  afterEach(async()=>h.db.exec("ROLLBACK; RESET ROLE"));afterAll(async()=>h.db.close());
  it.each([
    {quantity_millionths:"0"},{quantity_millionths:"1.5"},{quantity_millionths:1000000},
    {unit_price_minor:"01"},{unit_price_minor:"-1"},{unit_price_minor:"9223372036854775808"},
    {unit_price_minor:"9223372036854775807",quantity_millionths:"2000000"},
    {discount_minor:"102"},{discount_minor:"101"},{discount_minor:0},{tax_minor:"0"},{sku_id:"unverified"},
  ])("rejects invalid, zero, overflowing or unsupported financial input %j",async(change)=>{
    await expect(h.draft(customer,[{...serviceLines[0],...change}])).rejects.toThrow();
    expect((await h.query("SELECT * FROM public.aqvora_journals")).rows).toHaveLength(0);
  });
  it("enforces distinct OWNER checker and does not invent accounting/sales roles",async()=>{
    const submitted=await h.transition(await h.draft(customer),"submit");
    await expect(h.transition(submitted,"approve")).rejects.toThrow("OWNER");
    await h.user(i.owner);const owned=await h.transition(await h.draft(customer),"submit");
    await expect(h.transition(owned,"approve")).rejects.toThrow("distinct");
    await h.user(i.cashier);await expect(h.get(submitted.id)).rejects.toThrow("authorized");
    await expect(h.draft(customer)).rejects.toThrow("not authorized");
  });
  it("blocks unsupported jurisdiction and disabled posting without touching source money",async()=>{
    const draft=await h.draft(customer);await h.db.exec("RESET ROLE");
    await h.query("UPDATE private.aqvora_sales_policies SET is_active=false WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.transition(draft,"submit")).rejects.toThrow("tax policy");
    await h.db.exec("RESET ROLE");await h.query("UPDATE private.aqvora_sales_policies SET is_active=true WHERE organization_id=$1",[i.org]);
    await h.user();const approved=await h.approve(draft);
    await h.db.exec("RESET ROLE");await h.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("not enabled");
    expect((await h.get(draft.id)).state).toBe("approved");
  });
  it("rejects tax-policy revision, fiscal-close, mapping and archived-customer drift after approval",async()=>{
    const approved=await h.approve(await h.draft(customer));
    await h.db.exec("RESET ROLE");await h.query("UPDATE private.aqvora_sales_policies SET revision=2 WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("policy changed");
    await h.db.exec("RESET ROLE");await h.query("UPDATE private.aqvora_sales_policies SET revision=1 WHERE organization_id=$1",[i.org]);
    await h.query("UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1",[i.org]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("closed");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.aqvora_periods SET state='open' WHERE organization_id=$1",[i.org]);
    await h.query("UPDATE private.aqvora_sales_policies SET revenue_account_id=$2 WHERE organization_id=$1",[i.org,i.cash]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("revenue mapping");
    await h.db.exec("RESET ROLE");await h.query("UPDATE private.aqvora_sales_policies SET revenue_account_id=$2 WHERE organization_id=$1",[i.org,i.sales]);
    await h.user(i.owner);await h.query("SELECT public.archive_aqvora_customer($1,$2,1,'Retired')",[i.org,customer]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("customer");
  });
  it("keeps issued history readable and receipts recoverable after close, archival and disablement",async()=>{
    const approved=await h.approve(await h.draft(customer));const intent=h.key();const receipt=await h.issue(approved,intent);
    await h.user(i.owner);await h.query("SELECT public.archive_aqvora_customer($1,$2,1,'Retired')",[i.org,customer]);
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1",[i.org]);
    await h.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);
    await h.user();expect(await h.issue(approved,intent)).toEqual(receipt);
    expect((await h.get(approved.id)).reconciliation?.face_minor).toBe("101");
  });
  it("denies foreign customers, invoices, guessed company IDs and unauthorized direct source access",async()=>{
    const d=await h.draft(customer);await h.user(i.outsider);const foreign=await h.customer(i.otherOrg);
    await expect(h.get(d.id)).rejects.toThrow("authorized");await expect(h.issue(d)).rejects.toThrow("not authorized");
    await h.user();await expect(h.get(d.id,i.otherOrg)).rejects.toThrow("authorized");
    await expect(h.draft(foreign)).rejects.toThrow("customer");
    for(const table of ["aqvora_customers","aqvora_sales_invoices","aqvora_sales_issue_receipts","aqvora_sales_audit"]){
      await expect(h.query(`SELECT * FROM public.${table}`)).rejects.toThrow("permission");
      await expect(h.query(`DELETE FROM public.${table}`)).rejects.toThrow("permission");
    }
    await expect(h.query("SELECT private.aqvora_sales_source_valid($1,$2)",[i.org,d.id])).rejects.toThrow("permission");
    await h.db.exec("RESET ROLE;SET ROLE anon");await expect(h.get(d.id)).rejects.toThrow("permission");
  });
  it("rechecks AAL, actor session, active membership and both issuer/checker role revocation",async()=>{
    const approved=await h.approve(await h.draft(customer));await h.user(i.manager,"aal1");
    await expect(h.issue(approved)).rejects.toThrow("MFA");await expect(h.get(approved.id)).rejects.toThrow("MFA");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.owner]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("checker");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET role='OWNER' WHERE organization_id=$1 AND user_id=$2",[i.org,i.owner]);
    await h.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2",[i.org,i.manager]);
    await h.user();await expect(h.issue(approved)).rejects.toThrow("not authorized");
    await h.db.exec("RESET ROLE");await h.query("UPDATE public.organization_members SET is_active=true WHERE organization_id=$1 AND user_id=$2",[i.org,i.manager]);
    await h.query("DELETE FROM auth.sessions WHERE user_id=$1",[i.manager]);await h.user();
    await expect(h.get(approved.id)).rejects.toThrow("MFA");await expect(h.issue(approved)).rejects.toThrow("revoked");
  });
  it("preserves the generic writer's rejection of forged AR/customer/open-item references",async()=>{
    await expect(h.query("SELECT public.post_aqvora_journal($1,'forged','2026-11-20',$2::jsonb)",[i.org,JSON.stringify([
      {account_id:ar,debit_minor:"101",credit_minor:"0",party_id:customer,open_item_id:h.key()},
      {account_id:i.sales,debit_minor:"0",credit_minor:"101"},
    ])])).rejects.toThrow("Verified source");
  });
  it("treats draft creation intents as exact retries, with permanent customer code identity",async()=>{
    const key=h.key();const first=await h.draft(customer,serviceLines,key);expect((await h.draft(customer,serviceLines,key)).id).toBe(first.id);
    await expect(h.draft(customer,[{...serviceLines[0],unit_price_minor:"1"}],key)).rejects.toThrow("idempotency");
    const result=(await h.query<{r:{id:string}}>("SELECT public.create_aqvora_customer($1,'FIXED','One') r",[i.org])).rows[0].r;
    expect((await h.query<{r:{id:string}}>("SELECT public.create_aqvora_customer($1,'FIXED','One') r",[i.org])).rows[0].r.id).toBe(result.id);
    await expect(h.query("SELECT public.create_aqvora_customer($1,'fixed','Different')",[i.org])).rejects.toThrow("different request");
  });
  it("fails closed on a tampered issued source/audit even when journal totals remain balanced",async()=>{
    const approved=await h.approve(await h.draft(customer));await h.issue(approved);
    await h.db.exec("RESET ROLE");
    // Deliberate superuser corruption probe, isolated and rolled back with this test.
    await h.query(`INSERT INTO public.aqvora_sales_audit(organization_id,entity_type,entity_id,revision,action,actor_id,after_row)
      VALUES ($1,'invoice',$2,5,'EDIT',$3,'{}')`,[i.org,approved.id,i.owner]);
    await h.user();await expect(h.get(approved.id)).rejects.toThrow("inconsistent");
    await expect(h.query("SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR')",[i.org])).rejects.toThrow("inconsistent");
  });
  it("refuses to post if privileged tampering changes the approved source and recomputes its hash",async()=>{
    const d=await h.approve(await h.draft(customer));await h.db.exec("RESET ROLE");
    const input=JSON.stringify([{...serviceLines[0],unit_price_minor:"1"}]);
    await h.query(`UPDATE public.aqvora_sales_invoices SET lines=private.aqvora_sales_lines($3::jsonb)->'lines',
      gross_minor=1,face_minor=1 WHERE organization_id=$1 AND id=$2`,[i.org,d.id,input]);
    await h.query(`UPDATE public.aqvora_sales_invoices d SET fingerprint=private.aqvora_sales_fingerprint(d)
      WHERE organization_id=$1 AND id=$2`,[i.org,d.id]);
    await h.user();await expect(h.issue(await h.get(d.id))).rejects.toThrow("approval audit");
    expect((await h.query("SELECT * FROM public.aqvora_journals")).rows).toHaveLength(0);
  });
});
