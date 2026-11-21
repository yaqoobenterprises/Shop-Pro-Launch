// @vitest-environment node
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {createClient} from "@supabase/supabase-js";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {localIdentity,localAuthOptions,type LocalIdentity} from "./support/aqvoraLocalIdentity";
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";
import type {CurrencyPolicyRead} from "../src/accounting/currencyContracts";
import {serviceLines} from "./support/aqvoraSalesFixture";
const statusPath=process.env.AQVORA_LOCAL_SUPABASE_STATUS;
describe.skipIf(!statusPath)("Currency policy through real local Auth and PostgREST",()=>{
  let db:Client;let api:string;let anon:string;let org:string;
  let owner:LocalIdentity;let manager:LocalIdentity;let foreign:LocalIdentity;
  const call=async(actor:LocalIdentity|null,path:string,body?:object,method="POST")=>{
    const response=await fetch(`${api}/rest/v1/${path}`,{method,headers:{apikey:anon,
      Authorization:`Bearer ${actor?.token??anon}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json() as unknown};};
  const read=(actor:LocalIdentity|null,company=org,currency="PKR",date="2026-11-20")=>call(actor,"rpc/read_aqvora_currency_policy",
    {p_organization_id:company,p_currency:currency,p_as_of_date:date});
  const ok=(r:{status:number;data:unknown})=>{expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data as CurrencyPolicyRead;};
  const denied=(r:{status:number;data:unknown})=>expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(400);
  beforeAll(async()=>{
    if(process.env.AQVORA_DISPOSABLE_STACK!=="1")throw Error("Disposable local stack marker required");
    const status=JSON.parse(readFileSync(statusPath!,"utf8")) as Record<string,string>;api=status.API_URL;anon=status.ANON_KEY;
    if(!["127.0.0.1","localhost"].includes(new URL(api).hostname)||!["127.0.0.1","localhost"].includes(new URL(status.DB_URL).hostname))throw Error("Only local endpoints permitted");
    db=new Client({connectionString:status.DB_URL});await db.connect();const admin=createClient(api,status.SERVICE_ROLE_KEY,localAuthOptions);
    owner=await localIdentity(api,anon,admin);manager=await localIdentity(api,anon,admin);foreign=await localIdentity(api,anon,admin);
    org=(await db.query("SELECT organization_id FROM public.profiles WHERE id=$1",[owner.id])).rows[0].organization_id;
    await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'MANAGER',true)",[org,manager.id]);
  },120000);
  afterAll(async()=>{if(db)await db.end();});
  it("exposes an honest unconfigured state, then a dated independently sourced policy",async()=>{
    expect(ok(await read(owner))).toMatchObject({status:"unconfigured",display_complete:false,policy:null});
    await db.query(currencySeedSql(org,owner.id));
    const p=ok(await read(manager));expect(p).toMatchObject({organization_id:org,status:"configured",display_complete:true,
      policy:{currency_exponent:2,minor_units_per_major:"100",revision:"1",provenance:{kind:"trusted_company_accounting_policy"}}});
    expect(ok(await read(owner,org,"PKR","2025-12-31")).display_complete).toBe(false);
    denied(await read(owner,org,"USD"));denied(await read(owner,org,"PKR","infinity"));
  });
  it.each([["USD",2,"100"],["JPY",0,"1"],["KWD",3,"1000"],["CLF",4,"10000"]])(
    "preserves explicit %s exponent over actual JSON transport",async(currency,exponent,scale)=>{
      const company=randomUUID();await db.query("INSERT INTO public.organizations(id,name,owner_name,currency) VALUES($1,'Synthetic only','Test owner',$2)",[company,currency]);
      await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'OWNER',true)",[company,owner.id]);
      await db.query(currencySeedSql(company,owner.id,currency as string,exponent as number));
      expect(ok(await read(owner,company,currency as string)).policy).toMatchObject({currency_exponent:exponent,minor_units_per_major:scale});
      denied(await read(manager,company,currency as string));
    });
  it("denies anon, AAL1, foreign scope and direct policy bypasses",async()=>{
    for(const actor of [null,foreign,{...owner,token:owner.lowToken}])denied(await read(actor));
    for(const actor of [owner,manager]){
      denied(await call(actor,"aqvora_currency_policies",undefined,"GET"));
      denied(await call(actor,"rpc/aqvora_currency_at",{p_org:org,p_date:"2026-11-20",p_currency:"PKR"}));
      expect((await db.query("SELECT has_table_privilege('authenticated','private.aqvora_currency_policies','INSERT') allowed")).rows[0].allowed).toBe(false);
    }
  });
  it("retains historical fingerprints and detects privileged metadata corruption",async()=>{
    const original=ok(await read(owner));await db.query(currencySeedSql(org,owner.id,"PKR",2,2,"2026-12-01"));
    expect(ok(await read(owner))).toEqual(original);expect(ok(await read(owner,org,"PKR","2026-12-01")).policy?.revision).toBe("2");
    await db.query("BEGIN;ALTER TABLE private.aqvora_currency_policies DISABLE TRIGGER USER");
    await db.query("UPDATE private.aqvora_currency_policies SET exponent=0 WHERE organization_id=$1",[org]);
    await db.query("ALTER TABLE private.aqvora_currency_policies ENABLE TRIGGER USER;COMMIT");
    const bad=await read(owner);denied(bad);expect(bad.data).toMatchObject({code:"23514"});
    // Restore synthetic fixture through transaction rollback semantics, without changing committed production policy.
    await db.query("BEGIN;ALTER TABLE private.aqvora_currency_policies DISABLE TRIGGER USER");
    await db.query("UPDATE private.aqvora_currency_policies SET exponent=2 WHERE organization_id=$1",[org]);
    await db.query("ALTER TABLE private.aqvora_currency_policies ENABLE TRIGGER USER;COMMIT");
  });
  it("rejects corrupted unposted source scale through real authorized PostgREST reads and replay",async()=>{
    const customer=await call(manager,"rpc/create_aqvora_customer",{p_organization_id:org,
      p_code:randomUUID(),p_name:"Synthetic currency read integrity"});
    expect(customer.status,JSON.stringify(customer.data)).toBe(200);
    const request={p_organization_id:org,p_intent_key:randomUUID(),p_customer_id:(customer.data as {id:string}).id,
      p_business_date:"2026-11-20",p_due_date:"2026-12-20",p_currency:"PKR",p_lines:serviceLines};
    const draft=await call(manager,"rpc/create_aqvora_sales_draft",request);
    expect(draft.status,JSON.stringify(draft.data)).toBe(200);
    const id=(draft.data as {id:string}).id;
    const get=()=>call(manager,"rpc/get_aqvora_sales_invoice",{p_organization_id:org,p_invoice_id:id});
    expect((await get()).data).toMatchObject({currency_policy:ok(await read(manager)).policy});
    const mutate=async(date:string)=>{
      await db.query("BEGIN;ALTER TABLE public.aqvora_sales_invoices DISABLE TRIGGER USER");
      await db.query("UPDATE public.aqvora_sales_invoices SET business_date=$1 WHERE organization_id=$2 AND id=$3",[date,org,id]);
      await db.query("ALTER TABLE public.aqvora_sales_invoices ENABLE TRIGGER USER;COMMIT");
    };
    try{
      await mutate("2025-12-31");
      for(const response of [await get(),await call(manager,"rpc/list_aqvora_sales_invoices",{p_organization_id:org}),
        await call(manager,"rpc/create_aqvora_sales_draft",request)]){
        denied(response);expect(response.data).toMatchObject({code:"23514"});
      }
    }finally{await mutate("2026-11-20");}
    expect((await get()).data).toEqual(draft.data);
    expect((await call(manager,"rpc/create_aqvora_sales_draft",request)).data).toEqual(draft.data);
    const grants=await db.query(`SELECT has_function_privilege('authenticated',
      'private.aqvora_currency_source_policy(uuid,bigint,date,text,jsonb)','EXECUTE') allowed`);
    expect(grants.rows[0].allowed).toBe(false);
  });
  it("rechecks cashier, inactive membership and revoked sessions behind issued JWTs",async()=>{
    await db.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2",[org,manager.id]);denied(await read(manager));
    await db.query("UPDATE public.organization_members SET role='MANAGER',is_active=false WHERE organization_id=$1 AND user_id=$2",[org,manager.id]);denied(await read(manager));
    await db.query("UPDATE public.organization_members SET is_active=true WHERE organization_id=$1 AND user_id=$2",[org,manager.id]);expect(ok(await read(manager)).display_complete).toBe(true);
    const session=JSON.parse(Buffer.from(manager.token.split(".")[1],"base64url").toString()) as {session_id:string};
    await db.query("DELETE FROM auth.sessions WHERE id=$1",[session.session_id]);denied(await read(manager));
    expect(ok(await read(owner)).display_complete).toBe(true);
  });
});
