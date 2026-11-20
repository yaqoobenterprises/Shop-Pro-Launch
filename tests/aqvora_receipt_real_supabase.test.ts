// @vitest-environment node
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {createClient} from "@supabase/supabase-js";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {localIdentity,localAuthOptions,type LocalIdentity} from "./support/aqvoraLocalIdentity";
import {salesSeedSql,serviceLines,ar,type SalesDocument} from "./support/aqvoraSalesFixture";
import {receiptSeedSql,receiptCash,type CashDoc,type ReceiptDoc,type ReceiptIssue} from "./support/aqvoraReceiptFixture";
import type {GeneralLedgerPage,TrialBalancePage} from "../src/accounting/readContracts";
const statusPath=process.env.AQVORA_LOCAL_SUPABASE_STATUS;
describe.skipIf(!statusPath)("Receipt workflow with real local Supabase Auth/PostgREST",()=>{
  let db:Client;let api:string;let anon:string;let owner:LocalIdentity;let maker:LocalIdentity;let foreign:LocalIdentity;
  let org:string;let customer:string;let period:string;
  const call=async(who:LocalIdentity|null,path:string,body?:object,method="POST")=>{
    const r=await fetch(`${api}/rest/v1/${path}`,{method,headers:{apikey:anon,Authorization:`Bearer ${who?.token??anon}`,
      "Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text();return {status:r.status,data:text?JSON.parse(text) as unknown:null};};
  const rpc=(who:LocalIdentity|null,name:string,body:object)=>call(who,`rpc/${name}`,body);
  const ok=<T,>(r:{status:number;data:unknown}):T=>{expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
    expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);return r.data as T;};
  const deny=(r:{status:number;data:unknown})=>expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(400);
  const invoice=async(amount="101")=>{let d=ok<SalesDocument>(await rpc(maker,"create_aqvora_sales_draft",{
    p_organization_id:org,p_intent_key:randomUUID(),p_customer_id:customer,p_business_date:"2026-11-18",
    p_due_date:"2026-12-20",p_currency:"PKR",p_lines:[{...serviceLines[0],unit_price_minor:amount}]}));
    d=ok<SalesDocument>(await rpc(maker,"transition_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id,p_expected_revision:d.revision,p_action:"submit"}));
    d=ok<SalesDocument>(await rpc(owner,"transition_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id,p_expected_revision:d.revision,p_action:"approve"}));
    ok(await rpc(maker,"issue_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id,p_expected_revision:d.revision,p_fingerprint:d.fingerprint,p_intent_key:randomUUID()}));return d;};
  const cashRequest=(amount:unknown="101")=>({p_organization_id:org,p_intent_key:randomUUID(),p_customer_id:customer,
    p_business_date:"2026-11-20",p_currency:"PKR",p_amount_minor:amount,p_source_kind:"controlled_cash"});
  const confirmed=async(amount="101")=>{const c=ok<CashDoc>(await rpc(maker,"create_aqvora_cash_collection",cashRequest(amount)));
    return ok<CashDoc>(await rpc(owner,"confirm_aqvora_cash_collection",{p_organization_id:org,p_collection_id:c.id,
      p_expected_revision:c.revision,p_counted_minor:amount,p_attestation:"cash_counted_in_person"}));};
  const prepare=async(c:CashDoc,allocations:object[])=>{let d=ok<ReceiptDoc>(await rpc(maker,"create_aqvora_customer_receipt_draft",{
    p_organization_id:org,p_intent_key:randomUUID(),p_collection_id:c.id,p_allocations:allocations}));
    d=ok<ReceiptDoc>(await rpc(maker,"transition_aqvora_customer_receipt",{p_organization_id:org,p_receipt_id:d.id,p_expected_revision:d.revision,p_action:"submit"}));
    return ok<ReceiptDoc>(await rpc(owner,"transition_aqvora_customer_receipt",{p_organization_id:org,p_receipt_id:d.id,p_expected_revision:d.revision,p_action:"approve"}));};
  const postRequest=(d:ReceiptDoc)=>({p_organization_id:org,p_receipt_id:d.id,p_expected_revision:d.revision,p_fingerprint:d.fingerprint,p_intent_key:randomUUID()});
  beforeAll(async()=>{
    if(process.env.AQVORA_DISPOSABLE_STACK!=="1")throw new Error("Disposable Supabase marker required");
    const status=JSON.parse(readFileSync(statusPath!,"utf8")) as Record<string,string>;api=status.API_URL;anon=status.ANON_KEY;
    if(!["127.0.0.1","localhost"].includes(new URL(api).hostname)||!["127.0.0.1","localhost"].includes(new URL(status.DB_URL).hostname))throw new Error("Only local test endpoints allowed");
    db=new Client({connectionString:status.DB_URL});await db.connect();const admin=createClient(api,status.SERVICE_ROLE_KEY,localAuthOptions);
    owner=await localIdentity(api,anon,admin);maker=await localIdentity(api,anon,admin);foreign=await localIdentity(api,anon,admin);
    org=(await db.query("SELECT organization_id FROM public.profiles WHERE id=$1",[owner.id])).rows[0].organization_id;
    await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'MANAGER',true)",[org,maker.id]);
    await db.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)",[org]);
    period=ok<{id:string}>(await rpc(owner,"create_aqvora_period",{p_organization_id:org,p_starts_on:"2026-01-01",p_ends_on:"2026-12-31"})).id;
    const revenue=ok<{id:string}>(await rpc(owner,"create_aqvora_account",{p_organization_id:org,p_code:"4000",p_name:"Services",
      p_account_class:"revenue",p_normal_side:"credit",p_parent_id:null,p_is_posting:true})).id;
    await db.query(salesSeedSql(org,owner.id,revenue));await db.query(receiptSeedSql(org,owner.id));
    customer=ok<{id:string}>(await rpc(maker,"create_aqvora_customer",{p_organization_id:org,p_code:"C-001",p_name:"Synthetic receipt customer"})).id;
  },120000);
  afterAll(async()=>{if(db)await db.end();});
  it("rejects numeric money coercion, bank claims, self-attestation and unauthenticated/foreign/AAL1 callers",async()=>{
    for(const amount of [1,1.5,"0","01","-1","9223372036854775808",{verified:true}])deny(await rpc(maker,"create_aqvora_cash_collection",cashRequest(amount)));
    deny(await rpc(maker,"create_aqvora_cash_collection",{...cashRequest(),p_source_kind:"bank_deposit"}));
    for(const actor of [null,foreign,{...maker,token:maker.lowToken}])deny(await rpc(actor,"create_aqvora_cash_collection",cashRequest()));
    const c=ok<CashDoc>(await rpc(maker,"create_aqvora_cash_collection",cashRequest()));
    deny(await rpc(maker,"confirm_aqvora_cash_collection",{p_organization_id:org,p_collection_id:c.id,p_expected_revision:c.revision,p_counted_minor:"101",p_attestation:"cash_counted_in_person"}));
    ok(await rpc(maker,"cancel_aqvora_cash_collection",{p_organization_id:org,p_collection_id:c.id,p_expected_revision:c.revision,p_reason:"Synthetic unused claim"}));
  });
  it("denies all direct source writes/reads and private helper bypasses through PostgREST",async()=>{
    for(const table of ["aqvora_cash_collections","aqvora_customer_receipts","aqvora_receipt_allocations","aqvora_receipt_issues","aqvora_receipt_audit"]){
      deny(await call(maker,`${table}?organization_id=eq.${org}`,undefined,"GET"));deny(await call(maker,table,{organization_id:org}));
      deny(await call(maker,`${table}?organization_id=eq.${org}`,{state:"posted"},"PATCH"));deny(await call(maker,`${table}?organization_id=eq.${org}`,undefined,"DELETE"));}
    deny(await rpc(maker,"aqvora_customer_receipt_source_valid",{p_org:org,p_id:randomUUID()}));
    deny(await rpc(maker,"aqvora_receipt_validate_locked",{r:{organization_id:org}}));
  });
  it("posts once through issued JWTs, partially settles two invoices and reconciles every source dimension",async()=>{
    const x=await invoice();const y=await invoice("202");const c=await confirmed("141");
    const d=await prepare(c,[{invoice_id:y.id,amount_minor:"101"},{invoice_id:x.id,amount_minor:"40"}]);const args=postRequest(d);
    const [first,retry]=await Promise.all([rpc(maker,"post_aqvora_customer_receipt",args),rpc(maker,"post_aqvora_customer_receipt",args)]);
    const receipt=ok<ReceiptIssue>(first);expect(ok(retry)).toEqual(receipt);expect(receipt.allocations).toHaveLength(2);
    expect(new Set(receipt.allocations.map(a=>a.allocation_id)).size).toBe(2);
    for(const [inv,outstanding] of [[x,"61"],[y,"101"]] as const){
      expect(ok(await rpc(maker,"get_aqvora_invoice_open_balance",{p_organization_id:org,p_invoice_id:inv.id,p_as_of_date:"2026-11-20"}))).toMatchObject({outstanding_minor:outstanding});}
    const read={p_organization_id:org,p_from_date:"2026-11-01",p_to_date:"2026-11-30",p_currency:"PKR"};
    expect(ok<TrialBalancePage>(await rpc(maker,"read_aqvora_trial_balance",read)).totals).toMatchObject({debit_minor:"444",credit_minor:"444"});
    const gl=ok<GeneralLedgerPage>(await rpc(maker,"read_aqvora_general_ledger",{...read,p_account_id:ar}));expect(gl.closing_minor).toBe("162");
    expect(gl.rows.filter(r=>r.journal_id===receipt.journal_id)).toHaveLength(2);
    expect(gl.rows.find(r=>r.journal_id===receipt.journal_id)).toMatchObject({source_kind:"customer_receipt",source_id:d.id,party_id:customer});
    expect(ok<GeneralLedgerPage>(await rpc(owner,"read_aqvora_general_ledger",{...read,p_account_id:receiptCash})).closing_minor).toBe("141");
    expect(ok(await rpc(owner,"read_aqvora_receivables",{p_organization_id:org,p_currency:"PKR",p_as_of_date:"2026-11-20"}))).toMatchObject({face_minor:"303",allocated_minor:"141",outstanding_minor:"162",ar_control_minor:"162"});
    deny(await rpc(owner,"post_aqvora_customer_receipt",args));deny(await rpc(maker,"post_aqvora_customer_receipt",{...args,p_fingerprint:"0".repeat(64)}));
    deny(await rpc(foreign,"get_aqvora_customer_receipt",{p_organization_id:org,p_receipt_id:d.id}));
    deny(await rpc(maker,"reverse_aqvora_journal",{organization_id:org,original_journal_id:receipt.journal_id,intent_key:randomUUID(),business_date:"2026-11-21",reason:"Fake refund"}));
    await expect(db.query("DELETE FROM public.aqvora_receipt_allocations WHERE organization_id=$1",[org])).rejects.toThrow("immutable");
    ok(await rpc(owner,"close_aqvora_period",{p_organization_id:org,p_period_id:period,p_expected_revision:"1",p_reason:"Synthetic close"}));
    expect(ok(await rpc(maker,"post_aqvora_customer_receipt",args))).toEqual(receipt);
    expect(ok(await rpc(maker,"lookup_aqvora_customer_receipt_issue",{p_organization_id:org,p_intent_key:args.p_intent_key}))).toEqual(receipt);
    ok(await rpc(owner,"reopen_aqvora_period",{p_organization_id:org,p_period_id:period,p_expected_revision:"2",p_reason:"Synthetic reopen"}));
  },120000);
  it("keeps BIGINT money exact through JSONB request parameters and JSON responses",async()=>{
    const amount="9223372036854775807";const inv=await invoice(amount);const c=await confirmed(amount);
    const d=await prepare(c,[{invoice_id:inv.id,amount_minor:amount}]);expect(ok<ReceiptIssue>(await rpc(maker,"post_aqvora_customer_receipt",postRequest(d))).amount_minor).toBe(amount);
    expect(ok(await rpc(maker,"get_aqvora_invoice_open_balance",{p_organization_id:org,p_invoice_id:inv.id,p_as_of_date:"2026-11-20"}))).toMatchObject({allocated_minor:amount,outstanding_minor:"0"});
  });
  it("rechecks checker demotion, CASHIER/inactive membership and deleted Auth session behind signed JWTs",async()=>{
    const inv=await invoice();const d=await prepare(await confirmed(),[{invoice_id:inv.id,amount_minor:"101"}]);const args=postRequest(d);
    await db.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[org,owner.id]);deny(await rpc(maker,"post_aqvora_customer_receipt",args));
    await db.query("UPDATE public.organization_members SET role='OWNER' WHERE organization_id=$1 AND user_id=$2",[org,owner.id]);
    await db.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);deny(await rpc(maker,"post_aqvora_customer_receipt",args));
    deny(await rpc(maker,"get_aqvora_customer_receipt",{p_organization_id:org,p_receipt_id:d.id}));
    await db.query("UPDATE public.organization_members SET role='MANAGER',is_active=false WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);deny(await rpc(maker,"post_aqvora_customer_receipt",args));
    await db.query("UPDATE public.organization_members SET is_active=true WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);
    const claims=JSON.parse(Buffer.from(maker.token.split(".")[1],"base64url").toString()) as {session_id:string};
    await db.query("DELETE FROM auth.sessions WHERE id=$1",[claims.session_id]);deny(await rpc(maker,"post_aqvora_customer_receipt",args));
    deny(await rpc(maker,"get_aqvora_invoice_open_balance",{p_organization_id:org,p_invoice_id:inv.id,p_as_of_date:"2026-11-20"}));
  });
  it("fails closed through PostgREST when a privileged corruption removes a posted allocation",async()=>{
    const allocation=(await db.query("SELECT * FROM public.aqvora_receipt_allocations WHERE organization_id=$1 ORDER BY id LIMIT 1",[org])).rows[0];
    await db.query("ALTER TABLE public.aqvora_receipt_allocations DISABLE TRIGGER USER");
    try{await db.query("DELETE FROM public.aqvora_receipt_allocations WHERE organization_id=$1 AND id=$2",[org,allocation.id]);}
    finally{await db.query("ALTER TABLE public.aqvora_receipt_allocations ENABLE TRIGGER USER");}
    const result=await rpc(owner,"get_aqvora_invoice_open_balance",{p_organization_id:org,p_invoice_id:allocation.invoice_id,p_as_of_date:"2026-11-20"});
    deny(result);expect(result.data).toMatchObject({code:"23514"});
    const tb=await rpc(owner,"read_aqvora_trial_balance",{p_organization_id:org,p_from_date:"2026-11-01",p_to_date:"2026-11-30",p_currency:"PKR"});
    deny(tb);expect(tb.data).toMatchObject({code:"23514"});
  });
});
