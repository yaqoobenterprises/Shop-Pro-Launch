// @vitest-environment node
// Real PostgreSQL independent backend connections; NEVER hosted Supabase.
import {readFileSync,readdirSync} from "node:fs";
import {Client} from "pg";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {assertDisposablePostgres} from "./support/assertDisposablePostgres";
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";

const base=process.env.AQVORA_TEST_DATABASE_URL;
const DB="aqvora_activation_races_disposable";
const MAKER="11111111-1111-4111-8111-111111111111";
const CHECKER="22222222-2222-4222-8222-222222222222";
const CREATE_KEY="33333333-3333-4333-8333-333333333333";
const MAKE_KEY="44444444-4444-4444-8444-444444444444";
const CHECK_A="55555555-5555-4555-8555-555555555555";
const CHECK_B="66666666-6666-4666-8666-666666666666";
const PERIOD="77777777-7777-4777-8777-777777777777";
const ATTEST="I APPROVE THE NEW ZERO-OPENING AQVORA COMPANY FINANCE WRITER";
type Receipt={organization_id:string;status:string;activated_at?:string;checker_intent?:string};
const connections=new Set<Client>();
let admin:Client;let inspector:Client;let organization="";
const dbUrl=(db:string)=>{const u=new URL(base!);u.pathname="/"+db;return u.toString();};
async function open(db=DB){
  const c=new Client({connectionString:dbUrl(db)});
  await c.connect();connections.add(c);return c;
}
async function close(c:Client){
  try{await c.query("ROLLBACK");}catch{/* Closed or already committed */}
  await c.end();connections.delete(c);
}
async function asUser(user:string){
  const c=await open();
  await c.query("BEGIN");
  await c.query("SET LOCAL ROLE authenticated");
  await c.query("SET LOCAL statement_timeout = '6s'");
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),"+
    "set_config('request.jwt.claim.aal','aal2',true),"+
    "set_config('request.jwt.claim.session_id',$1,true)",[user]);
  return c;
}
async function blocked(c:Client){
  for(let i=0;i<90;i++){
    const r=await inspector.query<{waiting:boolean}>(
      "SELECT cardinality(pg_blocking_pids($1))>0 waiting",[c.processID]);
    if(r.rows[0].waiting)return;
    await new Promise(done=>setTimeout(done,20));
  }
  throw new Error("Expected real database lock contention; request did not block");
}
const create=(c:Client,name="Concurrent Fresh Company")=>c.query<{r:Receipt}>(
  "SELECT public.create_aqvora_fresh_company($1,$2,$3,$4,$5) r",
  [CREATE_KEY,name,"Pakistan","PKR","Asia/Karachi"]);
const propose=(c:Client)=>c.query<{r:Receipt}>(
  "SELECT public.propose_aqvora_fresh_finance_activation($1,$2,$3,1,$4) r",
  [organization,MAKE_KEY,PERIOD,"Independently approved zero-openings for the legal entity"]);
const approve=(c:Client,key:string)=>c.query<{r:Receipt}>(
  "SELECT public.approve_aqvora_fresh_finance_activation($1,$2,$3,$4) r",
  [organization,MAKE_KEY,key,ATTEST]);

describe.skipIf(!base)("AQVORA new-company and checker approval true PostgreSQL races",()=>{
  beforeAll(async()=>{
    assertDisposablePostgres(base);
    admin=await open(new URL(base!).pathname.slice(1));
    await admin.query("DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;"+
      "DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
    await admin.query("CREATE DATABASE "+DB);
    const c=await open();
    await c.query([
      "CREATE SCHEMA auth",
      "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}')",
      "CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL)",
      "CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text)",
      "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$",
      "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true)) $$",
      "GRANT USAGE ON SCHEMA auth TO authenticated",
    ].join(";\n")+";");
    await c.query("INSERT INTO auth.users(id,email) VALUES($1,'maker@example.test'),($2,'checker@example.test')",[MAKER,CHECKER]);
    await c.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1),($2,$2)",[MAKER,CHECKER]);
    const folder=new URL("../supabase/migrations/",import.meta.url);
    for(const file of readdirSync(folder).filter(x=>x.endsWith(".sql")).sort()){
      try{await c.query(readFileSync(new URL(file,folder),"utf8"));}
      catch(e){throw new Error("Migration failed on disposable PostgreSQL: "+file,{cause:e});}
    }
    inspector=c;
  },45000);
  afterAll(async()=>{
    for(const c of [...connections])if(c!==admin)await close(c);
    if(admin){
      await admin.query("DROP DATABASE IF EXISTS "+DB+" WITH (FORCE)");
      await close(admin);
    }
  },20000);

  it("serializes simultaneous same-key fresh creation without duplicate tenant",async()=>{
    const a=await asUser(MAKER),b=await asUser(MAKER);
    try{
      const first=(await create(a)).rows[0].r;
      const secondPromise=create(b);
      await blocked(b);
      await a.query("COMMIT");
      const second=(await secondPromise).rows[0].r;
      await b.query("COMMIT");
      organization=first.organization_id;
      expect(organization).toBe(second.organization_id);
      const c=await asUser(MAKER);
      try{
        await expect(create(c,"Changed fraudulently")).rejects.toThrow(/idempotency key changed/i);
      }finally{await close(c);}
      const result=await admin.query<{n:number}>("SELECT count(*)::int n FROM private.aqvora_fresh_company_origins WHERE creator_id=$1 AND creation_intent=$2",[MAKER,CREATE_KEY]);
      expect(result.rows[0].n).toBe(1);
    }finally{await close(a);await close(b);}
  },20000);

  it("rejects checker activation after maker's Auth session is revoked mid-flight",async()=>{
    await inspector.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'OWNER',true)",[organization,CHECKER]);
    for(const [code,name,cls,side] of [
      ["1010","Cash","asset","debit"],["2010","Payables","liability","credit"],
      ["3010","Capital","equity","credit"],["4010","Revenue","revenue","credit"],
      ["5010","COGS","cost_of_sales","debit"],["6010","Expenses","expense","debit"],
    ]){
      await inspector.query("INSERT INTO public.aqvora_accounts(organization_id,code,name,account_class,normal_side,is_posting) VALUES($1,$2,$3,$4,$5,true)",[organization,code,name,cls,side]);
    }
    await inspector.query("INSERT INTO public.aqvora_periods(organization_id,id,starts_on,ends_on,state) VALUES($1,$2,'2026-01-01','2026-12-31','open')",[organization,PERIOD]);
    await inspector.query(currencySeedSql(organization,MAKER));
    const maker=await asUser(MAKER);
    try{
      expect((await propose(maker)).rows[0].r.status).toBe("awaiting_independent_owner_approval");
      await maker.query("COMMIT");
    }finally{await close(maker);}
    const revoker=await open(),checker=await asUser(CHECKER);
    try{
      await revoker.query("BEGIN");
      await revoker.query("DELETE FROM auth.sessions WHERE id=$1",[MAKER]);
      const attempt=approve(checker,CHECK_A);
      await blocked(checker);
      await revoker.query("COMMIT");
      await expect(attempt).rejects.toThrow(/maker lost active OWNER or session/i);
      await checker.query("ROLLBACK");
      const result=await admin.query<{n:number}>("SELECT count(*)::int n FROM public.aqvora_enabled_companies WHERE organization_id=$1",[organization]);
      expect(result.rows[0].n).toBe(0);
    }finally{await close(checker);await close(revoker);}
    await inspector.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1)",[MAKER]);
  },20000);

  it("serializes two checker intents; immutable receipt and enabled row commit exactly once",async()=>{
    const a=await asUser(CHECKER),b=await asUser(CHECKER);
    try{
      const first=(await approve(a,CHECK_A)).rows[0].r;
      expect(first.status).toBe("fresh_finance_writer_enabled");
      const secondPromise=approve(b,CHECK_B);
      await blocked(b);
      await a.query("COMMIT");
      await expect(secondPromise).rejects.toThrow(/zero.*financial|already approved/i);
      await b.query("ROLLBACK");
      const c=await asUser(CHECKER);
      try{
        expect((await approve(c,CHECK_A)).rows[0].r).toEqual(first);
        const recovered=await c.query<{r:Receipt}>(
          "SELECT public.lookup_aqvora_fresh_finance_activation($1,$2) r",[organization,CHECK_A]);
        expect(recovered.rows[0].r).toEqual(first);
      }finally{await close(c);}
      const result=await admin.query<{enabled:number;approvals:number;journals:number}>(
        "SELECT (SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$1) enabled,"+
        "(SELECT count(*)::int FROM private.aqvora_finance_activation_approvals WHERE organization_id=$1) approvals,"+
        "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$1) journals",[organization]);
      expect(result.rows[0]).toEqual({enabled:1,approvals:1,journals:0});
    }finally{await close(a);await close(b);}
  },20000);
});
