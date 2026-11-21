// @vitest-environment node
/**
 * Zero-opening launch acceptance: disposable PostgreSQL with real AQVORA V2
 * migrations and real authenticated RPCs, never the production Supabase DB.
 */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { describe, expect, it } from "vitest";
import { currencySeedSql } from "./support/aqvoraCurrencyFixture";

const company = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = "11111111-1111-4111-8111-111111111111";
const day = "2026-11-20";
const cases = [
  { code:"1010",name:"Cash",account_class:"asset",normal_side:"debit" },
  { code:"1020",name:"Bank",account_class:"asset",normal_side:"debit" },
  { code:"2010",name:"Wages Payable",account_class:"liability",normal_side:"credit" },
  { code:"2020",name:"Bank Loan",account_class:"liability",normal_side:"credit" },
  { code:"2030",name:"Customer Advances",account_class:"liability",normal_side:"credit" },
  { code:"3010",name:"Owner Capital",account_class:"equity",normal_side:"credit" },
  { code:"4010",name:"Sales Revenue",account_class:"revenue",normal_side:"credit" },
  { code:"6010",name:"Office Expense",account_class:"expense",normal_side:"debit" },
  { code:"6020",name:"Wages Expense",account_class:"expense",normal_side:"debit" },
] as const;

type PostingResponse = {journal_id:string; intent_key:string};
type TrialBalance = {totals:{debit_minor:string;credit_minor:string;
  closing_debit_minor:string;closing_credit_minor:string}};
function lines(id:Record<string,string>, debit:string, credit:string, amount:string){
  return [
    {account_id:id[debit],debit_minor:amount,credit_minor:"0"},
    {account_id:id[credit],debit_minor:"0",credit_minor:amount},
  ];
}

describe("AQVORA new-company fresh zero-opening finance", () => {
  it("starts two independent company books at exactly zero; first human journal creates all movements", async () => {
    const db = new PGlite({ extensions:{uuid_ossp} });
    try {
      await db.exec([
        "CREATE ROLE anon; CREATE ROLE authenticated;",
        "CREATE SCHEMA auth;",
        "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');",
        "CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);",
        "CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text);",
        "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
        "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true)) $$;",
        "GRANT USAGE ON SCHEMA auth TO authenticated;",
      ].join("\n"));

      await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'fresh.owner@example.test')",[owner]);
      await db.query("INSERT INTO auth.sessions(id,user_id) VALUES ($1,$1)",[owner]);
      const folder = new URL("../supabase/migrations/",import.meta.url);
      const migrations = readdirSync(folder).filter(file=>file.endsWith(".sql")).sort();
      for(const file of migrations) {
        try { await db.exec(readFileSync(new URL(file,folder),"utf8")); }
        catch(err) { throw new Error("Fresh launch migration failed: "+file,{cause:err}); }
      }
      await db.query("INSERT INTO public.organizations(id,name,owner_name,currency) VALUES ($1,'FRESH ZERO START','Owner','PKR'),($2,'INDEPENDENT TENANT','Other','PKR')",[company,foreign]);
      await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES ($1,$2,'OWNER',true)",[company,owner]);
      await db.exec(currencySeedSql(company,owner));

      // A new company has no implicit owner capital, cash, historic Cashbook
      // import, inventory, trial balance transactions or V2 writer enrollment.
      const original = await db.query<{journals:number;lines:number;receipts:number;
        accounts:number;periods:number;enabled:number}>(
        "SELECT "+
        "(SELECT count(*)::int FROM public.aqvora_journals) AS journals,"+
        "(SELECT count(*)::int FROM public.aqvora_journal_lines) AS lines,"+
        "(SELECT count(*)::int FROM public.aqvora_posting_receipts) AS receipts,"+
        "(SELECT count(*)::int FROM public.aqvora_accounts) AS accounts,"+
        "(SELECT count(*)::int FROM public.aqvora_periods) AS periods,"+
        "(SELECT count(*)::int FROM public.aqvora_enabled_companies) AS enabled");
      expect(original.rows[0]).toEqual({
        journals:0,lines:0,receipts:0,accounts:0,periods:0,enabled:0,
      });
      const legacyCounts = await db.query<{n:number}>(
        "SELECT count(*)::int AS n FROM public.transactions");
      expect(legacyCounts.rows[0].n).toBe(0);

      await db.exec("BEGIN");
      await db.exec("SET LOCAL ROLE authenticated");
      await db.query(
        "SELECT set_config('request.jwt.claim.sub',$1,true),"+
        "set_config('request.jwt.claim.aal','aal2',true),"+
        "set_config('request.jwt.claim.session_id',$1,true)",[owner]);

      // Real owner-only administrative RPC: creates chart and one fiscal period,
      // but NO posted voucher, opening cash or invented capital offset.
      const created:Record<string,string>={};
      for(const item of cases){
        const r=await db.query<{account:{id:string;code:string}}>(
          "SELECT to_jsonb(public.create_aqvora_account($1,$2,$3,$4,$5,NULL,true)) AS account",
          [company,item.code,item.name,item.account_class,item.normal_side]);
        expect(r.rows[0].account.code).toBe(item.code);
        created[item.code]=r.rows[0].account.id;
      }
      const period=await db.query<{period:{id:string;state:string}}>(
        "SELECT to_jsonb(public.create_aqvora_period($1,$2::date,$3::date)) AS period",
        [company,"2026-01-01","2026-12-31"]);
      expect(period.rows[0].period.state).toBe("open");
      const count=await db.query<{n:number}>(
        "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1",
        [company]);
      expect(count.rows[0].n).toBe(0);

      // No writer is enabled by creating a company or its CoA. Fail closed.
      const draftLines=lines(created,"1010","3010","100000");
      await db.exec("SAVEPOINT disabled_books");
      await expect(db.query(
        "SELECT public.post_aqvora_journal($1,'owner-contribution',$2::date,$3::jsonb)",
        [company,day,JSON.stringify(draftLines)]))
        .rejects.toThrow(/not enabled/i);
      await db.exec("ROLLBACK TO SAVEPOINT disabled_books");
      await db.exec("RELEASE SAVEPOINT disabled_books");

      // Simulated founder approval is strictly within THIS disposable DB.
      // No code path here has access to production credentials.
      await db.exec("RESET ROLE");
      await db.query(
        "INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)",[company]);
      await db.exec("SET LOCAL ROLE authenticated");

      const examples=[
        ["owner-contribution","1010","3010","100000"], // Dr cash, Cr equity
        ["office-cost","6010","1010","20000"],         // expense
        ["earned-cash-sales","1010","4010","35000"],   // revenue
        ["wages-accrued","6020","2010","15000"],       // accrual; no cash
        ["cash-to-bank","1020","1010","30000"],        // internal transfer
        ["business-loan","1020","2020","50000"],       // liability, not revenue
        ["customer-advance","1020","2030","10000"],    // unearned liability
      ];
      const receiptIds:string[]=[];
      for(const [key,debit,credit,amount] of examples){
        const payload=JSON.stringify(lines(created,debit,credit,amount));
        const args=[company,key,day,payload];
        const result=await db.query<{r:PostingResponse}>(
          "SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb) AS r",args);
        expect(result.rows[0].r.journal_id).toBeTruthy();
        const retry=await db.query<{r:PostingResponse}>(
          "SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb) AS r",args);
        expect(retry.rows[0].r.journal_id).toBe(result.rows[0].r.journal_id);
        const recovered=await db.query<{r:PostingResponse}>(
          "SELECT public.lookup_aqvora_receipt($1,$2) AS r",[company,key]);
        expect(recovered.rows[0].r.journal_id).toBe(result.rows[0].r.journal_id);
        receiptIds.push(result.rows[0].r.journal_id);
      }
      expect(new Set(receiptIds).size).toBe(7);

      // Identical payload, different company is NOT authorized; original book
      // remains unchanged and foreign company is still empty.
      await db.exec("SAVEPOINT cross_company");
      await expect(db.query(
        "SELECT public.post_aqvora_journal($1,'foreign-attempt',$2::date,$3::jsonb)",
        [foreign,day,JSON.stringify(draftLines)]))
        .rejects.toThrow(/not authorized|MFA|membership|company/i);
      await db.exec("ROLLBACK TO SAVEPOINT cross_company");
      await db.exec("RELEASE SAVEPOINT cross_company");

      // One paisa imbalance and same intent mutated payload are forbidden.
      await db.exec("SAVEPOINT imbalance");
      await expect(db.query(
        "SELECT public.post_aqvora_journal($1,'bad-difference',$2::date,$3::jsonb)",
        [company,day,JSON.stringify([
          {account_id:created["6010"],debit_minor:"101",credit_minor:"0"},
          {account_id:created["1010"],debit_minor:"0",credit_minor:"100"},
        ])])).rejects.toThrow(/unbalanced/i);
      await db.exec("ROLLBACK TO SAVEPOINT imbalance");
      await db.exec("RELEASE SAVEPOINT imbalance");

      await db.exec("SAVEPOINT reused_key");
      await expect(db.query(
        "SELECT public.post_aqvora_journal($1,'owner-contribution',$2::date,$3::jsonb)",
        [company,day,JSON.stringify(lines(created,"1010","3010","1"))]))
        .rejects.toThrow(/idempotency|payload mismatch/i);
      await db.exec("ROLLBACK TO SAVEPOINT reused_key");
      await db.exec("RELEASE SAVEPOINT reused_key");

      const totals=await db.query<{journals:number;receipts:number;debit:string;
        credit:string;lines:number;foreign_journals:number}>(
        "SELECT "+
        "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$1) AS journals,"+
        "(SELECT count(*)::int FROM public.aqvora_posting_receipts WHERE organization_id=$1) AS receipts,"+
        "(SELECT sum(debit_minor)::text FROM public.aqvora_journal_lines WHERE organization_id=$1) AS debit,"+
        "(SELECT sum(credit_minor)::text FROM public.aqvora_journal_lines WHERE organization_id=$1) AS credit,"+
        "(SELECT count(*)::int FROM public.aqvora_journal_lines WHERE organization_id=$1) AS lines,"+
        "(SELECT count(*)::int FROM public.aqvora_journals WHERE organization_id=$2) AS foreign_journals",
        [company,foreign]);
      expect(totals.rows[0]).toEqual({
        journals:7,receipts:7,debit:"260000",credit:"260000",lines:14,foreign_journals:0,
      });
      const statement=await db.query<{report:TrialBalance}>(
        "SELECT public.read_aqvora_trial_balance($1,$2::date,$3::date,'PKR') AS report",
        [company,"2026-01-01","2026-12-31"]);
      expect(statement.rows[0].report.totals).toMatchObject({
        debit_minor:"260000",credit_minor:"260000",
        closing_debit_minor:"210000",closing_credit_minor:"210000",
      });
      const balances=await db.query<{code:string;balance:string}>(
        "SELECT a.code, sum(l.debit_minor-l.credit_minor)::text AS balance "+
        "FROM public.aqvora_journal_lines l JOIN public.aqvora_accounts a "+
        "ON (a.organization_id,a.id)=(l.organization_id,l.account_id) "+
        "WHERE l.organization_id=$1 GROUP BY a.code ORDER BY a.code",[company]);
      expect(Object.fromEntries(balances.rows.map(row=>[row.code,row.balance]))).toEqual({
        "1010":"85000","1020":"90000","2010":"-15000","2020":"-50000",
        "2030":"-10000","3010":"-100000","4010":"-35000",
        "6010":"20000","6020":"15000",
      });
      // Balance Sheet: assets 175000 = liabilities 75000 + capital 100000.
      // P&L: revenue 35000 - expenses (20000 + 15000) = 0.
      await db.exec("COMMIT");
      const independent=await db.query<{n:number}>(
        "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1",[foreign]);
      expect(independent.rows[0].n).toBe(0);
    } finally { await db.close(); }
  },120000);
});
