// @vitest-environment node
/**
 * PGlite executes the repository's REAL SQL migrations with fake Auth AAL2.
 * This test NEVER reaches a connected Supabase production/staging project.
 */
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {uuid_ossp} from "@electric-sql/pglite/contrib/uuid_ossp";
import {describe,expect,it} from "vitest";
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";

const MAKER="11111111-1111-4111-8111-111111111111";
const CHECKER="22222222-2222-4222-8222-222222222222";
const LEGACY="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREATE_KEY="33333333-3333-4333-8333-333333333333";
const MAKER_KEY="44444444-4444-4444-8444-444444444444";
const REVISED_KEY="55555555-5555-4555-8555-555555555555";
const CHECK_KEY="66666666-6666-4666-8666-666666666666";
const OTHER_CHECK_KEY="77777777-7777-4777-8777-777777777777";
const PERIOD="88888888-8888-4888-8888-888888888888";
const CASH="99999999-9999-4999-8999-999999999999";
const CAPITAL="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const ATTEST="I APPROVE THE NEW ZERO-OPENING AQVORA COMPANY FINANCE WRITER";

type R={organization_id:string;status:string;creation_intent?:string;
  maker_intent?:string;checker_intent?:string;
  journal_id?:string;currency?:string;company_name?:string;
  evidence_sha256?:string};
async function rejected(db:PGlite,sql:string,params:unknown[],match:RegExp) {
  await db.exec("SAVEPOINT denied_operation");
  try{await expect(db.query(sql,params)).rejects.toThrow(match);}
  finally{
    await db.exec("ROLLBACK TO SAVEPOINT denied_operation");
    await db.exec("RELEASE SAVEPOINT denied_operation");
  }
}

describe("Fresh AQVORA provenance, independent AAL2 owner activation & exact first journal",()=>{
  it("never activates an existing legacy company or a single-owner fresh company",async()=>{
    const db=new PGlite({extensions:{uuid_ossp}});
    try{
      await db.exec([
        "CREATE ROLE anon;CREATE ROLE authenticated;",
        "CREATE SCHEMA auth;",
        "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');",
        "CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);",
        "CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text);",
        "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
        "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true)) $$;",
        "GRANT USAGE ON SCHEMA auth TO authenticated;",
      ].join("\n"));
      // Pre-existing Auth members avoid triggering the legacy PKR 10,000
      // registration seed during migration setup; legacy money is separately
      // seeded below as intentional independent evidence.
      await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'maker@aqvora.invalid'),($2,'checker@aqvora.invalid')",[MAKER,CHECKER]);
      await db.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1),($2,$2)",[MAKER,CHECKER]);
      const folder=new URL("../supabase/migrations/",import.meta.url);
      for(const filename of readdirSync(folder).filter(x=>x.endsWith(".sql")).sort()){
        try{await db.exec(readFileSync(new URL(filename,folder),"utf8"));}
        catch(err){throw new Error("Fresh finance migration failed: "+filename,{cause:err});}
      }
      // Old Shop Pro has a pre-existing financed account and is NOT eligible.
      await db.query("INSERT INTO public.organizations(id,name,owner_name,currency) VALUES($1,'LEGACY SHOP','Owner','PKR')",[LEGACY]);
      await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'OWNER',true)",[LEGACY,MAKER]);
      await db.query("INSERT INTO public.payment_accounts(organization_id,name,type,opening_balance,current_balance,is_default) VALUES ($1,'Legacy Cash','CASH',10000,10000,true)",[LEGACY]);

      await db.exec("BEGIN");
      await db.exec("SET LOCAL ROLE authenticated");
      const login=async(user:string,aal="aal2")=>{
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),"+
          "set_config('request.jwt.claim.aal',$2,true),"+
          "set_config('request.jwt.claim.session_id',$1,true)",[user,aal]);
      };
      await login(MAKER);
      await rejected(db,
        "SELECT public.propose_aqvora_fresh_finance_activation($1,$2,$3,1,$4)",
        [LEGACY,MAKER_KEY,PERIOD,"Legacy actor cannot be made into a fresh company"],
        /Legacy or unproven|fiscal|authorization/i);

      const newCompany=(await db.query<{r:R}>(
        "SELECT public.create_aqvora_fresh_company($1,$2,$3,$4,$5) AS r",
        [CREATE_KEY,"AQVORA Fresh Factory","Pakistan","PKR","Asia/Karachi"],
      )).rows[0].r;
      const FRESH=newCompany.organization_id;
      expect(FRESH).not.toBe(LEGACY);
      expect(newCompany.status).toBe("fresh_company_created_zero_books");
      expect(newCompany.currency).toBe("PKR");
      const replay=(await db.query<{r:R}>(
        "SELECT public.create_aqvora_fresh_company($1,$2,$3,$4,$5) AS r",
        [CREATE_KEY,"AQVORA Fresh Factory","Pakistan","PKR","Asia/Karachi"],
      )).rows[0].r;
      expect(replay.organization_id).toBe(FRESH);
      await rejected(db,
        "SELECT public.create_aqvora_fresh_company($1,$2,$3,$4,$5)",
        [CREATE_KEY,"Altered legal name","Pakistan","PKR","Asia/Karachi"],
        /idempotency key changed/i);

      // Provenance is private by design: the authenticated OWNER cannot
      // SELECT it directly. Inspect source counts as the fixture superuser.
      await db.exec("RESET ROLE");
      const empty=await db.query<{journals:number;cash_accounts:number;origins:number;
        enabled:number;old_open:string}>(
        "SELECT (SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$1) journals,"+
        "(SELECT count(*)::int FROM public.payment_accounts WHERE organization_id=$1) cash_accounts,"+
        "(SELECT count(*)::int FROM private.aqvora_fresh_company_origins WHERE organization_id=$1) origins,"+
        "(SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$1) enabled,"+
        "(SELECT opening_balance::text FROM public.payment_accounts WHERE organization_id=$2 LIMIT 1) old_open",
        [FRESH,LEGACY]);
      expect(empty.rows[0]).toEqual({
        journals:0,cash_accounts:0,origins:1,enabled:0,old_open:"10000.00",
      });
      // Default/legacy Cashbook cannot seed money into a newly registered V2
      // company, even through a privileged synthetic test connection.
      await db.exec("RESET ROLE");
      await rejected(db,
        "INSERT INTO public.payment_accounts(organization_id,name,type,opening_balance,current_balance) VALUES ($1,'Fake Old Cash','CASH',10000,10000)",
        [FRESH],/Fresh AQVORA company cannot write to the legacy Cashbook/);
      await rejected(db,
        "INSERT INTO public.products(organization_id,name,opening_stock,current_stock) VALUES($1,'Fake legacy inventory',500,500)",
        [FRESH],/Fresh AQVORA company cannot write to the legacy Cashbook/);
      await rejected(db,
        "INSERT INTO public.customers(organization_id,name,outstanding_balance) VALUES($1,'Fake old receivable',9999)",
        [FRESH],/Fresh AQVORA company cannot write to the legacy Cashbook/);

      // Missing chart/policy/period cannot be approved or proposed.
      await db.exec("SET LOCAL ROLE authenticated");
      await login(MAKER);
      await rejected(db,
        "SELECT public.propose_aqvora_fresh_finance_activation($1,$2,$3,1,$4)",
        [FRESH,MAKER_KEY,PERIOD,"Actual verified opening setup ready for two owners"],
        /fiscal period|missing|required/i);

      await db.exec("RESET ROLE");
      // Fixture-only data: real implementation uses the audited owner admin
      // RPCs and privately authorized currency policy approvals.
      await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES ($1,$2,'OWNER',true)",[FRESH,CHECKER]);
      const chart=[
        [CASH,"1010","Cash","asset","debit"],
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac","2010","Payable","liability","credit"],
        [CAPITAL,"3010","Capital","equity","credit"],
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad","4010","Revenue","revenue","credit"],
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae","5010","Cost of Sales","cost_of_sales","debit"],
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf","6010","Expenses","expense","debit"],
      ];
      for(const [id,code,name,account_class,normal_side] of chart){
        await db.query(
          "INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting) VALUES($1,$2,$3,$4,$5,$6,true)",
          [FRESH,id,code,name,account_class,normal_side]);
      }
      await db.query(
        "INSERT INTO public.aqvora_periods(organization_id,id,starts_on,ends_on,state) VALUES($1,$2,'2026-01-01','2026-12-31','open')",
        [FRESH,PERIOD]);
      await db.exec(currencySeedSql(FRESH,MAKER));
      await db.exec("SET LOCAL ROLE authenticated");
      await login(MAKER);
      const reason="Two independent verified owners approve new zero books";
      const proposalSql="SELECT public.propose_aqvora_fresh_finance_activation($1,$2,$3,1,$4) AS r";
      const proposal=(await db.query<{r:R}>(proposalSql,
        [FRESH,MAKER_KEY,PERIOD,reason])).rows[0].r;
      expect(proposal.status).toBe("awaiting_independent_owner_approval");
      expect(proposal.evidence_sha256).toMatch(/^[0-9a-f]{64}$/);
      const sameProposal=(await db.query<{r:R}>(proposalSql,
        [FRESH,MAKER_KEY,PERIOD,reason])).rows[0].r;
      expect(sameProposal).toEqual(proposal);
      await rejected(db,proposalSql,[FRESH,MAKER_KEY,PERIOD,reason+" modified"],
        /already used with different/);
      // Single-actor dual approval is forbidden even with valid MFA.
      const approveSql="SELECT public.approve_aqvora_fresh_finance_activation($1,$2,$3,$4) AS r";
      await rejected(db,approveSql,[FRESH,MAKER_KEY,CHECK_KEY,ATTEST],/distinct|Second ACTIVE/);
      expect((await db.query<{n:number}>(
        "SELECT count(*)::int n FROM public.aqvora_enabled_companies WHERE organization_id=$1",
        [FRESH])).rows[0].n).toBe(0);

      // A genuine second OWNER cannot approve on an AAL1 session.
      await login(CHECKER,"aal1");
      await rejected(db,approveSql,[FRESH,MAKER_KEY,CHECK_KEY,ATTEST],/MFA|AAL2/i);
      await login(CHECKER);

      // Document drift invalidates maker approval. A new maker intent is
      // required; never quietly reuse or edit a signed historic proposal.
      await db.exec("RESET ROLE");
      await db.query("UPDATE public.aqvora_accounts SET name='Verified Cash Account' WHERE organization_id=$1 AND id=$2",
        [FRESH,CASH]);
      await db.exec("SET LOCAL ROLE authenticated");
      await login(CHECKER);
      await rejected(db,approveSql,[FRESH,MAKER_KEY,CHECK_KEY,ATTEST],/changed since maker approval/);
      await login(MAKER);
      const revised=(await db.query<{r:R}>(proposalSql,
        [FRESH,REVISED_KEY,PERIOD,reason])).rows[0].r;
      expect(revised.evidence_sha256).not.toBe(proposal.evidence_sha256);

      // A revoked maker session prevents second-owner approval.
      await db.exec("RESET ROLE");
      await db.query("DELETE FROM auth.sessions WHERE id=$1",[MAKER]);
      await db.exec("SET LOCAL ROLE authenticated");
      await login(CHECKER);
      await rejected(db,approveSql,[FRESH,REVISED_KEY,CHECK_KEY,ATTEST],/Original finance maker lost/);
      await db.exec("RESET ROLE");
      await db.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1)",[MAKER]);
      await db.exec("SET LOCAL ROLE authenticated");
      await login(CHECKER);
      await rejected(db,approveSql,[FRESH,REVISED_KEY,CHECK_KEY,"not enough"],
        /explicitly approve/);

      // The only successful enrollment commits checker receipt and writer
      // eligibility as one transaction under the company-row lock.
      const approved=(await db.query<{r:R}>(approveSql,
        [FRESH,REVISED_KEY,CHECK_KEY,ATTEST])).rows[0].r;
      expect(approved.status).toBe("fresh_finance_writer_enabled");
      expect(approved.checker_intent).toBe(CHECK_KEY);
      const recovered=(await db.query<{r:R}>(
        "SELECT public.lookup_aqvora_fresh_finance_activation($1,$2) AS r",
        [FRESH,CHECK_KEY])).rows[0].r;
      expect(recovered).toEqual(approved);
      const replayApproval=(await db.query<{r:R}>(approveSql,
        [FRESH,REVISED_KEY,CHECK_KEY,ATTEST])).rows[0].r;
      expect(replayApproval).toEqual(approved);
      await rejected(db,approveSql,
        [FRESH,REVISED_KEY,OTHER_CHECK_KEY,ATTEST],/zero legacy|already approved|requires zero/i);
      await rejected(db,approveSql,
        [FRESH,MAKER_KEY,CHECK_KEY,ATTEST],/idempotency key payload/i);

      const state=await db.query<{fresh_enabled:number;legacy_enabled:number;
        approved_count:number;fresh_postings:number}>(
        "SELECT (SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$1) fresh_enabled,"+
        "(SELECT count(*)::int FROM public.aqvora_enabled_companies WHERE organization_id=$2) legacy_enabled,"+
        "(SELECT count(*)::int FROM private.aqvora_finance_activation_approvals WHERE organization_id=$1) approved_count,"+
        "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$1) fresh_postings",
        [FRESH,LEGACY]);
      expect(state.rows[0]).toEqual({
        fresh_enabled:1,legacy_enabled:0,approved_count:1,fresh_postings:0,
      });

      // The FIRST real entry is separate from activation. No invented
      // opening cash, owner capital or revenue was silently posted.
      await login(MAKER);
      const lines=[
        {account_id:CASH,debit_minor:"10000",credit_minor:"0"},
        {account_id:CAPITAL,debit_minor:"0",credit_minor:"10000"},
      ];
      const posted=(await db.query<{r:R}>(
        "SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb) AS r",
        [FRESH,"founder-proven-first-contribution","2026-11-20",JSON.stringify(lines)]))
        .rows[0].r;
      expect(posted.journal_id).toBeTruthy();
      await db.exec("COMMIT");
      expect((await db.query<{n:number}>(
        "SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1",
        [FRESH])).rows[0].n).toBe(1);
      expect((await db.query<{n:number}>(
        "SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1",
        [LEGACY])).rows[0].n).toBe(0);
    }finally{await db.close();}
  },120000);
});
