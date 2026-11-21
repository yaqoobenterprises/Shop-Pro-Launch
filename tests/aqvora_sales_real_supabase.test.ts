// @vitest-environment node
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";
import {createHmac,randomBytes,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {salesSeedSql,serviceLines,ar,type SalesDocument,type SalesReceipt} from "./support/aqvoraSalesFixture";
import type {GeneralLedgerPage,TrialBalancePage} from "../src/accounting/readContracts";
const statusPath=process.env.AQVORA_LOCAL_SUPABASE_STATUS;
type Identity={id:string;client:SupabaseClient;token:string;lowToken:string};
function totp(secret:string){let bits=0,value=0;const bytes:number[]=[];
  for(const c of secret.toUpperCase().replace(/=+$/,"")){const digit="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
    if(digit<0)throw new Error("Invalid Auth TOTP secret");value=(value<<5)|digit;bits+=5;
    if(bits>=8){bytes.push((value>>>(bits-=8))&255);value&=(1<<bits)-1;}}
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",Buffer.from(bytes)).update(counter).digest();const offset=digest[digest.length-1]&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,"0");
}
describe.skipIf(!statusPath)("Verified sales with real local Supabase Auth/PostgREST",()=>{
  let db:Client;let api:string;let anon:string;let owner:Identity;let maker:Identity;let foreign:Identity;
  let org:string;let customer:string;let revenue:string;let period:string;
  const options={auth:{autoRefreshToken:false,persistSession:false}};
  const call=async(who:Identity|null,path:string,body?:object,method="POST")=>{
    const r=await fetch(`${api}/rest/v1/${path}`,{method,headers:{apikey:anon,Authorization:`Bearer ${who?.token??anon}`,
      "Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text();return {status:r.status,data:text?JSON.parse(text) as unknown:null};};
  const rpc=(who:Identity|null,name:string,body:object)=>call(who,`rpc/${name}`,body);
  const ok=<T,>(r:{status:number;data:unknown}):T=>{expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
    expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);return r.data as T;};
  const deny=(r:{status:number;data:unknown})=>expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(400);
  const transition=async(d:SalesDocument,action:string,who=maker)=>ok<SalesDocument>(await rpc(who,"transition_aqvora_sales_invoice",
    {p_organization_id:org,p_invoice_id:d.id,p_expected_revision:d.revision,p_action:action}));
  const draft=async(lines=serviceLines)=>ok<SalesDocument>(await rpc(maker,"create_aqvora_sales_draft",{
    p_organization_id:org,p_intent_key:randomUUID(),p_customer_id:customer,p_business_date:"2026-11-20",
    p_due_date:"2026-12-20",p_currency:"PKR",p_lines:lines}));
  const prepare=async(lines=serviceLines)=>transition(await transition(await draft(lines),"submit"),"approve",owner);
  const issueRequest=(d:SalesDocument,intent=randomUUID())=>({p_organization_id:org,p_invoice_id:d.id,
    p_expected_revision:d.revision,p_fingerprint:d.fingerprint,p_intent_key:intent});
  beforeAll(async()=>{
    if(process.env.AQVORA_DISPOSABLE_STACK!=="1")throw new Error("Disposable Supabase marker required");
    const status=JSON.parse(readFileSync(statusPath!,"utf8")) as Record<string,string>;
    api=status.API_URL;anon=status.ANON_KEY;
    if(!["127.0.0.1","localhost"].includes(new URL(api).hostname)||
      !["127.0.0.1","localhost"].includes(new URL(status.DB_URL).hostname))throw new Error("Only local test endpoints allowed");
    db=new Client({connectionString:status.DB_URL});await db.connect();const admin=createClient(api,status.SERVICE_ROLE_KEY,options);
    const identity=async():Promise<Identity>=>{const email=`sales-${randomUUID()}@example.test`;const password=randomBytes(24).toString("hex");
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
      const client=createClient(api,anon,options);const signed=await client.auth.signInWithPassword({email,password});
      if(signed.error||!signed.data.session)throw signed.error??new Error("Auth session missing");
      const lowToken=signed.data.session.access_token;const factor=await client.auth.mfa.enroll({factorType:"totp"});
      if(factor.error)throw factor.error;
      const verified=await client.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)});
      if(verified.error)throw verified.error;const session=await client.auth.getSession();
      const token=session.data.session!.access_token;
      expect(JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString()).aal).toBe("aal2");
      return {id:created.data.user!.id,client,token,lowToken};};
    owner=await identity();maker=await identity();foreign=await identity();
    org=(await db.query("SELECT organization_id FROM public.profiles WHERE id=$1",[owner.id])).rows[0].organization_id;
    await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'MANAGER',true)",[org,maker.id]);
    await db.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)",[org]);
    period=ok<{id:string}>(await rpc(owner,"create_aqvora_period",{p_organization_id:org,p_starts_on:"2026-01-01",p_ends_on:"2026-12-31"})).id;
    revenue=ok<{id:string}>(await rpc(owner,"create_aqvora_account",{p_organization_id:org,p_code:"4000",p_name:"Services",
      p_account_class:"revenue",p_normal_side:"credit",p_parent_id:null,p_is_posting:true})).id;
    await db.query(currencySeedSql(org,owner.id));
    await db.query(salesSeedSql(org,owner.id,revenue));
    customer=ok<{id:string}>(await rpc(maker,"create_aqvora_customer",{p_organization_id:org,p_code:"C-001",p_name:"Synthetic customer"})).id;
  },120000);
  afterAll(async()=>{if(db)await db.end();});
  it("requires real MFA/company roles and denies all direct source access",async()=>{
    const create={p_organization_id:org,p_code:"DENIED",p_name:"No access"};
    deny(await rpc(null,"create_aqvora_customer",create));
    deny(await rpc({...maker,token:maker.lowToken},"create_aqvora_customer",create));
    deny(await rpc(foreign,"list_aqvora_sales_invoices",{p_organization_id:org}));
    expect(ok<unknown[]>(await rpc(maker,"list_aqvora_sales_invoices",{p_organization_id:org}))).toEqual([]);
    const d=await draft();const submitted=await transition(d,"submit");
    deny(await rpc(maker,"transition_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id,p_expected_revision:submitted.revision,p_action:"approve"}));
    deny(await rpc(foreign,"get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id}));
    deny(await rpc({...owner,token:owner.lowToken},"get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id}));
    for(const table of ["aqvora_customers","aqvora_sales_invoices","aqvora_sales_issue_receipts","aqvora_sales_audit"]){
      deny(await call(maker,`${table}?organization_id=eq.${org}`,undefined,"GET"));
      deny(await call(maker,table,{organization_id:org}));
      deny(await call(maker,`${table}?organization_id=eq.${org}`,{state:"issued"},"PATCH"));
      deny(await call(maker,`${table}?organization_id=eq.${org}`,undefined,"DELETE"));}
    deny(await rpc(maker,"aqvora_sales_source_valid",{p_org:org,p_invoice:d.id}));
  });
  it("atomically issues exactly once, reconciles GL/TB, and recovers after close with immutable history",async()=>{
    const d=await prepare([{...serviceLines[0],quantity_millionths:"1500000",discount_minor:"2"}]);const args=issueRequest(d);
    const [first,retry]=await Promise.all([rpc(maker,"issue_aqvora_sales_invoice",args),rpc(maker,"issue_aqvora_sales_invoice",args)]);
    const receipt=ok<SalesReceipt>(first);expect(ok(retry)).toEqual(receipt);expect(receipt.face_minor).toBe("150");
    expect(receipt).toMatchObject({currency_policy:{organization_id:org,currency_exponent:2,minor_units_per_major:"100",revision:"1"}});
    deny(await rpc(maker,"issue_aqvora_sales_invoice",{...args,p_fingerprint:"0".repeat(64)}));
    const read={p_organization_id:org,p_from_date:"2026-11-01",p_to_date:"2026-11-30",p_currency:"PKR"};
    const tb=ok<TrialBalancePage>(await rpc(maker,"read_aqvora_trial_balance",read));expect(tb.totals.debit_minor).toBe("150");
    expect(tb.source).toMatchObject({display_complete:true,currency_policy:{organization_id:org,currency_exponent:2,minor_units_per_major:"100",revision:"1"}});
    const gl=ok<GeneralLedgerPage>(await rpc(maker,"read_aqvora_general_ledger",{...read,p_account_id:ar,p_snapshot_token:tb.source.snapshot_token}));
    expect(gl.rows[0]).toMatchObject({journal_id:receipt.journal_id,party_id:customer,open_item_id:d.id,source_kind:"sales_invoice",source_id:d.id});
    const large=await prepare([{...serviceLines[0],unit_price_minor:"9223372036854775807"}]);
    expect(ok<SalesReceipt>(await rpc(maker,"issue_aqvora_sales_invoice",issueRequest(large))).face_minor).toBe("9223372036854775807");
    expect(ok<TrialBalancePage>(await rpc(maker,"read_aqvora_trial_balance",read)).totals.debit_minor).toBe((9223372036854775807n+150n).toString());
    deny(await rpc(maker,"reverse_aqvora_journal",{organization_id:org,original_journal_id:receipt.journal_id,
      intent_key:randomUUID(),business_date:"2026-11-21",reason:"Not a linked credit"}));
    ok(await rpc(owner,"close_aqvora_period",{p_organization_id:org,p_period_id:period,p_expected_revision:"1",p_reason:"Synthetic close"}));
    expect(ok(await rpc(maker,"issue_aqvora_sales_invoice",args))).toEqual(receipt);
    expect(ok(await rpc(maker,"lookup_aqvora_sales_issue",{p_organization_id:org,p_intent_key:args.p_intent_key}))).toEqual(receipt);
    const detail=ok<SalesDocument>(await rpc(owner,"get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id}));
    expect(detail.reconciliation?.ar_debit_minor).toBe("150");
    await expect(db.query("UPDATE public.aqvora_sales_invoices SET face_minor=1 WHERE organization_id=$1 AND id=$2",[org,d.id])).rejects.toThrow("immutable");
    ok(await rpc(owner,"reopen_aqvora_period",{p_organization_id:org,p_period_id:period,p_expected_revision:"2",p_reason:"Synthetic reopen"}));
  },120000);
  it("rejects checker downgrade, inactive membership and revoked Auth sessions despite still-signed JWTs",async()=>{
    const d=await prepare();const args=issueRequest(d);
    await db.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[org,owner.id]);
    deny(await rpc(maker,"issue_aqvora_sales_invoice",args));
    await db.query("UPDATE public.organization_members SET role='OWNER' WHERE organization_id=$1 AND user_id=$2",[org,owner.id]);
    await db.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);
    deny(await rpc(maker,"get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id}));
    deny(await rpc(maker,"issue_aqvora_sales_invoice",args));
    await db.query("UPDATE public.organization_members SET is_active=true,role='CASHIER' WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);
    deny(await rpc(maker,"issue_aqvora_sales_invoice",args));
    await db.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",[org,maker.id]);
    const claims=JSON.parse(Buffer.from(maker.token.split(".")[1],"base64url").toString()) as {session_id:string};
    await db.query("DELETE FROM auth.sessions WHERE id=$1",[claims.session_id]);
    deny(await rpc(maker,"issue_aqvora_sales_invoice",args));
    deny(await rpc(maker,"get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:d.id}));
  });
});
