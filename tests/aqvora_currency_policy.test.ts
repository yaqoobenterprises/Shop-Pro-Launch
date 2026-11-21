// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {currencyFixtureSql,currencySeedSql,currencyMigrationSql,readIds as i} from "./support/aqvoraCurrencyFixture";
import {receiptFixtureSql,receiptHarness,ar,receiptCash,serviceLines} from "./support/aqvoraReceiptFixture";
import type {CurrencyPolicyRead,CurrencyUnitPolicy} from "../src/accounting/currencyContracts";
import type {AccountingReadSource,TrialBalancePage} from "../src/accounting/readContracts";
import {PGlite} from "@electric-sql/pglite";
import {salesSeedSql,type SalesDocument} from "./support/aqvoraSalesFixture";

describe("Authoritative currency units and financial integrity",()=>{
  const h=receiptHarness();
  const policy=async(date="2026-11-20",org=i.org,currency="PKR")=>(await h.query<{r:CurrencyPolicyRead}>(
    "SELECT public.read_aqvora_currency_policy($1,$2,$3) r",[org,currency,date])).rows[0].r;
  const tb=async(token:string|null=null,cursor:unknown=null,limit=100)=>(await h.query<{r:TrialBalancePage}>(
    "SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-12-31','PKR',$2,$3::jsonb,$4) r",
    [i.org,limit,cursor===null?null:JSON.stringify(cursor),token])).rows[0].r;
  const admin=async(sql:string)=>{await h.db.exec("RESET ROLE");await h.db.exec(sql);await h.user();};
  const posted=async()=>{const customer=await h.customer();const inv=await h.invoice(customer,"150");
    const cash=await h.confirm(await h.cash(customer,"60"));const draft=await h.approveReceipt(await h.draftReceipt(cash,[{invoice_id:inv.id,amount_minor:"60"}]));
    return {inv,cash,draft,receipt:await h.postReceipt(draft)};};
  beforeAll(async()=>h.db.exec(currencyFixtureSql()),60000);
  beforeEach(async()=>{await h.db.exec("BEGIN");await h.user();});
  afterEach(async()=>h.db.exec("ROLLBACK;RESET ROLE"));
  afterAll(async()=>h.db.close());

  it.each([["PKR",2,"100"],["USD",2,"100"],["JPY",0,"1"],["KWD",3,"1000"],["CLF",4,"10000"]])(
    "returns authoritative %s precision independently of locale",async(currency,exponent,scale)=>{
      const org="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      await admin(`INSERT INTO public.organizations(id,currency) VALUES('${org}','${currency}');
        INSERT INTO public.organization_members VALUES('${org}','${i.owner}','OWNER',true),('${org}','${i.manager}','OWNER',true);`+
        currencySeedSql(org,i.owner,currency as string,exponent as number));
      await h.user(i.owner);const result=await policy("2026-11-20",org,currency as string);
      expect(result).toMatchObject({status:"configured",display_complete:true,policy:{organization_id:org,
        transaction_currency:currency,ledger_currency:currency,currency_exponent:exponent,display_decimal_places:exponent,
        minor_units_per_major:scale,revision:"1",effective_from:"2026-01-01",fx_supported:false}});
      expect(result.policy?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      await admin(`INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES('${org}');
        INSERT INTO public.aqvora_periods(organization_id,starts_on,ends_on,state) VALUES('${org}','2026-01-01','2026-12-31','open');
        INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting)
          VALUES('${org}','${i.sales}','4000','Synthetic service','revenue','credit',true);`+
        salesSeedSql(org,i.owner,i.sales).replaceAll("'PKR'",`'${currency}'`));
      await h.user(i.owner);const customer=await h.customer(org);
      let d=(await h.query<{r:SalesDocument}>("SELECT public.create_aqvora_sales_draft($1,'currency-draft',$2,'2026-11-20','2026-12-20',$3,$4::jsonb) r",
        [org,customer,currency,JSON.stringify([{...serviceLines[0],quantity_millionths:"1500000",discount_minor:"2"}])])).rows[0].r;
      d=(await h.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'submit') r",[org,d.id,d.revision])).rows[0].r;
      await h.user(i.manager);d=(await h.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'approve') r",[org,d.id,d.revision])).rows[0].r;
      const receipt=(await h.query<{r:{face_minor:string;currency_policy:CurrencyUnitPolicy}}>("SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,'currency-issue') r",
        [org,d.id,d.revision,d.fingerprint])).rows[0].r;
      expect(receipt.face_minor).toBe("150");expect(receipt.currency_policy).toEqual(result.policy);
      // Exact interpretation: quotient/remainder remain integers even at BIGINT limits.
      const value=BigInt(receipt.face_minor),denominator=BigInt(receipt.currency_policy.minor_units_per_major);
      expect((value/denominator)*denominator+value%denominator).toBe(150n);
    });
  it("returns an explicit unconfigured date and refuses a writer without policy",async()=>{
    expect(await policy("2025-12-31")).toMatchObject({status:"unconfigured",display_complete:false,policy:null});
    const customer=await h.customer();
    await expect(h.query("SELECT public.create_aqvora_sales_draft($1,'no-policy',$2,'2025-12-31','2026-12-31','PKR',$3::jsonb)",
      [i.org,customer,JSON.stringify(serviceLines)])).rejects.toThrow("unconfigured");
    expect((await h.query("SELECT count(*)::int n FROM public.aqvora_journals")).rows[0]).toEqual({n:0});
  });
  it("preserves older revisions, fingerprints, exact receipts and historical cutoffs",async()=>{
    const {inv,receipt}=await posted();const original=await policy();const originalRead=await h.get(inv.id);
    await admin(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-11-21"));
    expect(await policy()).toEqual(original);
    expect((await policy("2026-11-21")).policy?.revision).toBe("2");
    expect(await h.get(inv.id)).toEqual(originalRead);
    expect((await h.query<{r:unknown}>("SELECT public.lookup_aqvora_customer_receipt_issue($1,$2) r",[i.org,(receipt as unknown as {intent_key:string}).intent_key])).rows[0].r).toEqual(receipt);
    const source= (await tb()).source as AccountingReadSource & {currency_policy_revisions:CurrencyUnitPolicy[]};
    expect(source.currency_policy_revisions.map(p=>p.revision)).toEqual(["1","2"]);
  });
  it.each([i.cashier,i.outsider])("denies foreign and unauthorized roles: %s",async(actor)=>{
    await h.user(actor);await expect(policy()).rejects.toMatchObject({code:"42501"});
  });
  it("denies AAL1, revoked sessions and inactive memberships",async()=>{
    await h.user(i.owner,"aal1");await expect(policy()).rejects.toMatchObject({code:"42501"});
    await admin(`UPDATE public.organization_members SET is_active=false WHERE organization_id='${i.org}' AND user_id='${i.manager}'`);
    await expect(policy()).rejects.toMatchObject({code:"42501"});
    await h.user(i.owner);await admin(`DELETE FROM auth.sessions WHERE id='${i.owner}'`);await h.user(i.owner);
    await expect(policy()).rejects.toMatchObject({code:"42501"});
  });
  it.each([i.owner,i.manager])("allows policy reads but no direct mutation for %s",async(actor)=>{
    await h.user(actor);expect((await policy()).status).toBe("configured");
    await expect(h.query("SELECT * FROM private.aqvora_currency_policies")).rejects.toThrow("permission denied");
    await expect(h.query(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-12-01"))).rejects.toThrow("permission denied");
  });
  it.each([[2,"2026-12-01",3],[1,"2026-12-01",2],[2,"2026-01-01",2],[3,"2026-12-01",2]])(
    "rejects incompatible/stale currency schedule %s/%s/%s",async(revision,date,exponent)=>{
      await h.db.exec("RESET ROLE");await expect(h.query(currencySeedSql(i.org,i.owner,"PKR",exponent as number,revision as number,date as string))).rejects.toMatchObject({code:"23514"});
    });
  it("cannot retroactively change even an unposted source or book currency",async()=>{
    await h.draft(await h.customer());await h.db.exec("RESET ROLE");
    await expect(h.query(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-11-20"))).rejects.toThrow("reinterpret");
    await expect(h.query(`UPDATE public.organizations SET currency='USD' WHERE id='${i.org}'`)).rejects.toThrow("cutover");
    await expect(h.query("UPDATE private.aqvora_currency_policies SET exponent=0")).rejects.toThrow("immutable");
    await expect(h.query("DELETE FROM private.aqvora_currency_policies")).rejects.toThrow("immutable");
    await expect(h.query("TRUNCATE private.aqvora_currency_policies CASCADE")).rejects.toThrow("immutable");
  });
  it("ties invoice, cash, receipt, posting, AR, GL and TB to identical exact units",async()=>{
    const {inv,cash,draft,receipt}=await posted();const p=(await policy()).policy;
    for(const row of [await h.get(inv.id),cash,draft,receipt,await h.openBalance(inv.id)] as unknown as Array<{currency_policy:unknown}>)
      expect(row.currency_policy).toEqual(p);
    const report=await tb();expect((report.source as unknown as {currency_policy:unknown}).currency_policy).toEqual(p);
    expect(report.totals.debit_minor).toBe("210");expect(report.totals.credit_minor).toBe("210");
    const gl=(await h.query<{r:{source:{currency_policy:unknown};closing_minor:string}}>(
      "SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-12-31','PKR') r",[i.org,ar])).rows[0].r;
    expect(gl.closing_minor).toBe("90");expect(gl.source.currency_policy).toEqual(p);
    const arRead=(await h.query<{r:{source:{currency_policy:unknown};outstanding_minor:string}}>(
      "SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20') r",[i.org])).rows[0].r;
    expect(arRead.outstanding_minor).toBe("90");expect(arRead.source.currency_policy).toEqual(p);
    const raw=(await h.query<{payload:{currency_policy:unknown}}>("SELECT payload FROM public.aqvora_posting_receipts")).rows;
    expect(raw).toHaveLength(2);raw.forEach(r=>expect(r.payload.currency_policy).toEqual(p));
  });
  it("binds generic posting and same-key changed payloads to currency evidence",async()=>{
    const lines=[{account_id:receiptCash,debit_minor:"1",credit_minor:"0"},{account_id:i.sales,debit_minor:"0",credit_minor:"1"}];
    const post=(items:unknown)=>h.query<{r:{currency_policy:unknown}}>("SELECT public.post_aqvora_journal($1,'unit-retry','2026-11-20',$2::jsonb) r",[i.org,JSON.stringify(items)]);
    const first=(await post(lines)).rows[0].r;expect((await post(lines)).rows[0].r).toEqual(first);
    expect(first.currency_policy).toEqual((await policy()).policy);
    await expect(post([{...lines[0],debit_minor:"2"},{...lines[1],credit_minor:"2"}])).rejects.toThrow("payload mismatch");
    await h.db.exec("RESET ROLE;ALTER TABLE public.aqvora_posting_receipts DISABLE TRIGGER USER");
    await h.db.exec("UPDATE public.aqvora_posting_receipts SET payload=jsonb_set(payload,'{currency_policy,currency_exponent}','0')");
    await h.user();await expect(h.query("SELECT public.lookup_aqvora_receipt($1,'unit-retry')",[i.org])).rejects.toThrow("inconsistent");
    await expect(post(lines)).rejects.toThrow("inconsistent");
  });
  it.each(["invoice","receipt","journal","policy"])("fails closed on corrupted %s policy metadata",async(kind)=>{
    const {inv,draft}=await posted();await h.db.exec("RESET ROLE");
    const [table,column,id]=kind==="invoice"?["public.aqvora_sales_invoices","policy_snapshot",inv.id]:kind==="receipt"?
      ["public.aqvora_receipt_issues","response",draft.id]:["public.aqvora_journals","payload",null];
    if(kind==="policy")await h.db.exec("ALTER TABLE private.aqvora_currency_policies DISABLE TRIGGER USER; UPDATE private.aqvora_currency_policies SET exponent=0");
    else {await h.db.exec(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      const predicate=kind==="receipt"?`receipt_id='${id}'`:id?`id='${id}'`:"true";
      await h.db.exec(`UPDATE ${table} SET ${column}=jsonb_set(${column},'{currency_policy,currency_exponent}','0') WHERE ${predicate}`);}
    await h.user();await expect(tb()).rejects.toThrow(/inconsistent|incomplete/);
  });
  it("invalidates GL/TB/AR pagination when a relevant policy revision is appended",async()=>{
    const {inv}=await posted();await h.invoice(inv.customer_id);const first=await tb(null,null,1);expect(first.has_more).toBe(true);
    const gl=(await h.query<{r:{source:AccountingReadSource;next_cursor:unknown}}>(
      "SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-12-31','PKR',1) r",[i.org,ar])).rows[0].r;
    const open=(await h.query<{r:{source:AccountingReadSource;next_after_id:string}}>(
      "SELECT public.list_aqvora_open_invoices($1,$2,'PKR','2026-12-31',NULL,1) r",[i.org,inv.customer_id])).rows[0].r;
    await admin(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-12-01"));
    await expect(tb(first.source.snapshot_token,first.next_cursor,1)).rejects.toMatchObject({code:"40001"});
    await expect(h.query("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-12-31','PKR',1,$3::jsonb,$4)",
      [i.org,ar,JSON.stringify(gl.next_cursor),gl.source.snapshot_token])).rejects.toMatchObject({code:"40001"});
    await expect(h.query("SELECT public.list_aqvora_open_invoices($1,$2,'PKR','2026-12-31',$3,1,$4)",
      [i.org,inv.customer_id,open.next_after_id,open.source.snapshot_token])).rejects.toMatchObject({code:"40001"});
    const next=await tb();expect(next.source.snapshot_token).not.toBe(first.source.snapshot_token);
  });
  it("requires snapshot-bound valid report cursors and exposes complete counts",async()=>{
    const {inv}=await posted();const a=await tb(null,null,1);await expect(tb(null,a.next_cursor,1)).rejects.toThrow("snapshot");
    const open=(await h.query<{r:{source:AccountingReadSource}}>("SELECT public.list_aqvora_open_invoices($1,$2,'PKR','2026-12-31') r",
      [i.org,inv.customer_id])).rows[0].r;
    await expect(h.query("SELECT public.list_aqvora_open_invoices($1,$2,'PKR','2026-12-31',$3,1,$4)",
      [i.org,inv.customer_id,i.foreign,open.source.snapshot_token])).rejects.toThrow("cursor");
    await expect(tb(a.source.snapshot_token,{...a.next_cursor,code:"fake"},1)).rejects.toThrow("cursor");
    const rows=[...a.rows];let page=a;
    while(page.has_more){page=await tb(a.source.snapshot_token,page.next_cursor,1);rows.push(...page.rows);}
    expect(rows.length.toString()).toBe(a.matched_count);expect(new Set(rows.map(r=>r.account.id)).size).toBe(rows.length);
  });
  it("preserves exact BIGINT boundaries and half-up line rounding in configured units",async()=>{
    const customer=await h.customer();const invoice=await h.invoice(customer,"9223372036854775807");
    expect(invoice.face_minor).toBe("9223372036854775807");
    const d=await h.draft(customer,[{...serviceLines[0],quantity_millionths:"1500000",unit_price_minor:"101",discount_minor:"2"}]);
    expect(d).toMatchObject({gross_minor:"152",face_minor:"150"});
    await expect(h.draft(customer,[{...serviceLines[0],unit_price_minor:"9223372036854775808"}])).rejects.toThrow("limit");
    await expect(h.draft(customer,[{...serviceLines[0],discount_minor:"102"}])).rejects.toThrow("discount");
    await expect(h.draft(customer,[{...serviceLines[0],unit_price_minor:"1.0"}])).rejects.toThrow("canonical");
  });
  it("revokes implicit PUBLIC execution on every new private policy helper",async()=>{
    const rows=(await h.query<{proname:string;anon:boolean;authenticated:boolean}>(`SELECT p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private'
        AND (p.proname LIKE 'aqvora_currency_%' OR p.proname='aqvora_certify_currency_base')`)).rows;
    expect(rows.length).toBeGreaterThan(8);rows.forEach(row=>{expect(row.anon,row.proname).toBe(false);expect(row.authenticated,row.proname).toBe(false);});
  });
});

it("upgrades existing unscaled history without asserting an invented currency meaning",async()=>{
  const h=receiptHarness();try{
    await h.db.exec(receiptFixtureSql()+"BEGIN");await h.user();const inv=await h.invoice(await h.customer());
    const before=await h.get(inv.id);await h.db.exec("RESET ROLE");await h.db.exec(currencyMigrationSql());await h.user();
    expect(await h.get(inv.id)).toEqual(before);
    const report=(await h.query<{r:{source:{display_complete:boolean;currency_policy:null}}}>(
      "SELECT public.read_aqvora_trial_balance($1,'2026-01-01','2026-12-31','PKR') r",[i.org])).rows[0].r;
    expect(report.source).toMatchObject({display_complete:false,currency_policy:null});
    await h.db.exec("RESET ROLE");await expect(h.query(currencySeedSql())).rejects.toThrow("cutover");
  }finally{await h.db.close();}
},60000);

it("rolls back the complete currency migration batch on a late injected failure",async()=>{
  const db=new PGlite();try{await db.exec(receiptFixtureSql());await db.exec("BEGIN");
    await expect(db.exec(currencyMigrationSql()+"SELECT 1/0;")).rejects.toThrow();await db.exec("ROLLBACK");
    expect((await db.query("SELECT to_regclass('private.aqvora_currency_policies') r")).rows[0]).toEqual({r:null});
    expect((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='aqvora_journals' AND column_name='currency_policy_revision'")).rows[0]).toEqual({n:0});
  }finally{await db.close();}
},60000);
