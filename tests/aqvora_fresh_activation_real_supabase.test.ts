// @vitest-environment node
// Real issued Auth AAL2 JWTs through local-only Supabase PostgREST.
// Currency policy and second-owner membership use TEST-ONLY superuser fixture
// because independent approval/invitation UI are not yet implemented.
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {createClient} from "@supabase/supabase-js";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {localIdentity,localAuthOptions,type LocalIdentity} from "./support/aqvoraLocalIdentity";
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";
const statusPath=process.env.AQVORA_LOCAL_SUPABASE_STATUS;
type Response={status:number;data:unknown};
type FreshReceipt={organization_id:string;creation_intent:string;status:string;currency:string};
type ActivationReceipt={organization_id:string;maker_intent:string;checker_intent:string;
  status:string;activated_at:string;evidence_sha256:string};
describe.skipIf(!statusPath)("Real local Supabase new-company owner MFA/activation RPCs",()=>{
  let db:Client;let api:string;let anon:string;
  let owner:LocalIdentity,checker:LocalIdentity,outsider:LocalIdentity;
  let freshOrg:string,legacyOrg:string,oldCash:string;
  let cashId:string,capitalId:string;
  let makerIntent:string;
  const creationIntent=randomUUID();
  const approvalIntent=randomUUID();
  const request={
    p_creation_intent:creationIntent,p_legal_name:"Fresh Real Auth Company",
    p_country:"Pakistan",p_currency:"PKR",p_timezone:"Asia/Karachi",
  };
  const call=async(identity:LocalIdentity|null,path:string,body?:object,method="POST"):Promise<Response>=>{
    const resp=await fetch(api+"/rest/v1/"+path,{method,headers:{
      apikey:anon,Authorization:"Bearer "+(identity?.token??anon),
      "Content-Type":"application/json","Prefer":"return=representation",
    },body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await resp.text();
    return {status:resp.status,data:raw?JSON.parse(raw) as unknown:null};
  };
  const rpc=(actor:LocalIdentity|null,name:string,body:object)=>call(actor,"rpc/"+name,body);
  const succeeded=(r:Response)=>{
    expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
    expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);
    return r.data as Record<string,unknown>;
  };
  const denied=(r:Response)=>expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(400);
  beforeAll(async()=>{
    if(process.env.AQVORA_DISPOSABLE_STACK!=="1")throw Error("Disposable Supabase marker required");
    const s=JSON.parse(readFileSync(statusPath!,"utf8")) as Record<string,string>;
    api=s.API_URL;anon=s.ANON_KEY;
    if(!api||!s.DB_URL||!s.SERVICE_ROLE_KEY||
       !["127.0.0.1","localhost"].includes(new URL(api).hostname)||
       !["127.0.0.1","localhost"].includes(new URL(s.DB_URL).hostname)) {
      throw Error("Finance activation integration test requires local CLI only");
    }
    db=new Client({connectionString:s.DB_URL});await db.connect();
    const admin=createClient(api,s.SERVICE_ROLE_KEY,localAuthOptions);
    owner=await localIdentity(api,anon,admin);
    checker=await localIdentity(api,anon,admin);
    outsider=await localIdentity(api,anon,admin);
    const original=await db.query<{organization_id:string}>(
      "SELECT organization_id FROM public.profiles WHERE id=$1",[owner.id]);
    legacyOrg=original.rows[0]?.organization_id;
    if(!legacyOrg)throw Error("Legacy signup company fixture was not created");
    oldCash=(await db.query<{amount:string}>(
      "SELECT coalesce(sum(opening_balance),0)::text amount FROM public.payment_accounts WHERE organization_id=$1",
      [legacyOrg])).rows[0].amount;
  },120000);
  afterAll(async()=>{if(db)await db.end();});

  it("denies anon/AAL1 and creates a distinct zero-books V2 company via real PostgREST",async()=>{
    denied(await rpc(null,"create_aqvora_fresh_company",request));
    denied(await rpc({...owner,token:owner.lowToken},"create_aqvora_fresh_company",request));
    const fresh=succeeded(await rpc(owner,"create_aqvora_fresh_company",request)) as unknown as FreshReceipt;
    freshOrg=fresh.organization_id;
    expect(fresh.status).toBe("fresh_company_created_zero_books");
    expect(fresh.currency).toBe("PKR");
    expect(freshOrg).not.toBe(legacyOrg);
    expect((succeeded(await rpc(owner,"create_aqvora_fresh_company",request)) as unknown as FreshReceipt)
      .organization_id).toBe(freshOrg);
    denied(await rpc(owner,"create_aqvora_fresh_company",{...request,p_legal_name:"Altered name"}));
    const count=await db.query<{legacy:string;fresh_cash:number;fresh_journals:number;origins:number;enabled:number}>(
      "SELECT (SELECT coalesce(sum(opening_balance),0)::text FROM public.payment_accounts WHERE organization_id=$1) legacy,"+
      "(SELECT count(*)::int FROM public.payment_accounts WHERE organization_id=$2) fresh_cash,"+
      "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$2) fresh_journals,"+
      "(SELECT count(*)::int FROM private.aqvora_fresh_company_origins WHERE organization_id=$2) origins,"+
      "(SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$2) enabled",
      [legacyOrg,freshOrg]);
    expect(count.rows[0]).toEqual({
      legacy:oldCash,fresh_cash:0,fresh_journals:0,origins:1,enabled:0,
    });
    denied(await call(owner,"aqvora_enabled_companies",{organization_id:freshOrg}));
    denied(await call(owner,"aqvora_finance_activation_approvals",undefined,"GET"));
  },90000);

  it("requires active second OWNER MFA, approved currency policy and exact unchanged evidence",async()=>{
    const make=async(code:string,name:string,cls:string,side:string)=>succeeded(
      await rpc(owner,"create_aqvora_account",{
        p_organization_id:freshOrg,p_code:code,p_name:name,
        p_account_class:cls,p_normal_side:side,p_parent_id:null,p_is_posting:true,
      }));
    cashId=String((await make("1010","Cash","asset","debit")).id);
    await make("2010","Payables","liability","credit");
    capitalId=String((await make("3010","Capital","equity","credit")).id);
    await make("4010","Sales","revenue","credit");
    await make("5010","COGS","cost_of_sales","debit");
    await make("6010","Expenses","expense","debit");
    const period=succeeded(await rpc(owner,"create_aqvora_period",{
      p_organization_id:freshOrg,p_starts_on:"2026-01-01",p_ends_on:"2026-12-31",
    }));
    makerIntent=randomUUID();
    const proposal={p_organization_id:freshOrg,p_maker_intent:makerIntent,
      p_fiscal_period_id:period.id,p_currency_policy_revision:1,
      p_reason:"Genuine owner authorizes zero-opening financial books"};
    denied(await rpc(owner,"propose_aqvora_fresh_finance_activation",proposal));
    // Explicitly synthetic policy approval: not a real launch authorization.
    await db.query(currencySeedSql(freshOrg,owner.id));
    const proposed=succeeded(await rpc(owner,"propose_aqvora_fresh_finance_activation",proposal));
    expect(proposed.status).toBe("awaiting_independent_owner_approval");
    expect(succeeded(await rpc(owner,"propose_aqvora_fresh_finance_activation",proposal)))
      .toEqual(proposed);
    const approve={p_organization_id:freshOrg,p_maker_intent:makerIntent,
      p_checker_intent:approvalIntent,
      p_checker_attestation:"I APPROVE THE NEW ZERO-OPENING AQVORA COMPANY FINANCE WRITER"};
    denied(await rpc(owner,"approve_aqvora_fresh_finance_activation",approve));
    denied(await rpc(outsider,"approve_aqvora_fresh_finance_activation",approve));
    denied(await rpc({...checker,token:checker.lowToken},
      "approve_aqvora_fresh_finance_activation",approve));
    // Temporary fixture-only owner membership, not a production invitation.
    await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'OWNER',true)",
      [freshOrg,checker.id]);
    const results=await Promise.all([
      rpc(checker,"approve_aqvora_fresh_finance_activation",approve),
      rpc(checker,"approve_aqvora_fresh_finance_activation",approve),
    ]);
    const verified=results.map(r=>succeeded(r) as unknown as ActivationReceipt);
    expect(verified[0]).toEqual(verified[1]);
    expect(verified[0].status).toBe("fresh_finance_writer_enabled");
    expect(succeeded(await rpc(checker,"lookup_aqvora_fresh_finance_activation",{
      p_organization_id:freshOrg,p_checker_intent:approvalIntent}))).toEqual(verified[0]);
    const counts=await db.query<{enabled:number;approvals:number;journals:number}>(
      "SELECT (SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$1) enabled,"+
      "(SELECT count(*)::int FROM private.aqvora_finance_activation_approvals WHERE organization_id=$1) approvals,"+
      "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$1) journals",[freshOrg]);
    expect(counts.rows[0]).toEqual({enabled:1,approvals:1,journals:0});
  },90000);

  it("posts no fictitious opening, then only one explicitly authorized first journal",async()=>{
    const intent=randomUUID();
    const posting={organization_id:freshOrg,intent_key:intent,business_date:"2026-11-20",
      lines:[{account_id:cashId,debit_minor:"12345",credit_minor:"0"},
        {account_id:capitalId,debit_minor:"0",credit_minor:"12345"}]};
    const posted=succeeded(await rpc(owner,"post_aqvora_journal",posting));
    expect(posted.total_minor).toBe("12345");
    expect(succeeded(await rpc(owner,"lookup_aqvora_receipt",{
      organization_id:freshOrg,intent_key:intent})).journal_id).toBe(posted.journal_id);
    const count=await db.query<{n:number}>(
      "SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1",
      [freshOrg]);
    expect(count.rows[0].n).toBe(1);
    expect((await db.query<{s:string}>("SELECT coalesce(sum(opening_balance),0)::text s FROM public.payment_accounts WHERE organization_id=$1",[legacyOrg])).rows[0].s).toBe(oldCash);
    const checkerJwt=JSON.parse(Buffer.from(checker.token.split(".")[1],"base64url").toString()) as {session_id:string};
    await db.query("DELETE FROM auth.sessions WHERE id=$1",[checkerJwt.session_id]);
    denied(await rpc(checker,"lookup_aqvora_fresh_finance_activation",{
      p_organization_id:freshOrg,p_checker_intent:approvalIntent}));
  },90000);
});
