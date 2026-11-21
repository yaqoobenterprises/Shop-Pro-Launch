// @vitest-environment node
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {describe,expect,it} from 'vitest';
import {reconcileLegacySourceSnapshot} from '../scripts/aqvora_legacy_source_reconcile.mjs';
import {prepareDisposableHistoricalJournalRehearsal} from '../scripts/aqvora_historical_staging_rehearsal.mjs';
import {currencySeedSql} from './support/aqvoraCurrencyFixture';

const SOURCE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='11111111-1111-4111-8111-111111111111';
const SRC_CASH='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SRC_BANK='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CAT_REVENUE='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CAT_EXPENSE='ffffffff-ffff-4fff-8fff-ffffffffffff';
const TARGET_CASH='22222222-2222-4222-8222-222222222222';
const TARGET_BANK='33333333-3333-4333-8333-333333333333';
const TARGET_REVENUE='44444444-4444-4444-8444-444444444444';
const TARGET_EXPENSE='55555555-5555-4555-8555-555555555555';
const PERIOD='66666666-6666-4666-8666-666666666666';
const TX_INCOME='77777777-7777-4777-8777-777777777777';
const TX_EXPENSE='88888888-8888-4888-8888-888888888888';
const TRANSFER='99999999-9999-4999-8999-999999999999';
const ledgerId=(n:number)=>'aaaa0000-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');

function syntheticSource(){
  return {
    schema_version:1,source_project_ref:'synthetic-ci-fixture',
    organization_id:SOURCE,currency:'PKR',
    transactions:[
      {id:TX_INCOME,organization_id:SOURCE,type:'income',status:'active',
        amount_paisa:'50000',account_posted:true,account_id:SRC_CASH,
        category_id:CAT_REVENUE,raw_text:'synthetic printing income',
        business_date:'2026-11-19',idempotency_key:'fixture-1'},
      {id:TX_EXPENSE,organization_id:SOURCE,type:'expense',status:'active',
        amount_paisa:'20000',account_posted:true,account_id:SRC_CASH,
        category_id:CAT_EXPENSE,raw_text:'synthetic supply expense',
        business_date:'2026-11-19',idempotency_key:'fixture-2'},
    ],
    payment_accounts:[
      {id:SRC_CASH,organization_id:SOURCE,name:'Synthetic Cash',type:'CASH',
        balance_paisa:'20000',opening_balance:'0.00',current_balance:'200.00'},
      {id:SRC_BANK,organization_id:SOURCE,name:'Synthetic Bank',type:'BANK',
        balance_paisa:'10000',opening_balance:'0.00',current_balance:'100.00'},
    ],
    account_ledger_entries:[
      {id:ledgerId(1),organization_id:SOURCE,account_id:SRC_CASH,transaction_id:TX_INCOME,
        transfer_id:null,entry_type:'INCOME',amount_paisa:'50000'},
      {id:ledgerId(2),organization_id:SOURCE,account_id:SRC_CASH,transaction_id:TX_EXPENSE,
        transfer_id:null,entry_type:'EXPENSE',amount_paisa:'-20000'},
      {id:ledgerId(3),organization_id:SOURCE,account_id:SRC_CASH,transaction_id:null,
        transfer_id:TRANSFER,entry_type:'TRANSFER_OUT',amount_paisa:'-10000'},
      {id:ledgerId(4),organization_id:SOURCE,account_id:SRC_BANK,transaction_id:null,
        transfer_id:TRANSFER,entry_type:'TRANSFER_IN',amount_paisa:'10000'},
    ],
    account_transfers:[{id:TRANSFER,organization_id:SOURCE,from_account_id:SRC_CASH,
      to_account_id:SRC_BANK,amount:'100.00',date:'2026-11-19',
      status:'ACTIVE',account_posted:true}],
    audit_log:[],transaction_drafts:[],
    categories:[
      {id:CAT_REVENUE,organization_id:SOURCE,kind:'income'},
      {id:CAT_EXPENSE,organization_id:SOURCE,kind:'expense'},
    ],
  };
}
function syntheticPolicy(source:ReturnType<typeof syntheticSource>){
  const rec=reconcileLegacySourceSnapshot(source,'synthetic-rehearsal');
  expect(rec.summary.ledger_source_reconciled).toBe(true);
  return {
    source_key:'synthetic-rehearsal',review_mode:'dry_run_only',
    source_project_ref:'synthetic-ci-fixture',source_organization_id:SOURCE,
    target_company_id:TARGET,currency:'PKR',minor_unit_exponent:2,
    expected_source_sha256:rec.summary.source_snapshot_sha256,
    payment_accounts:{
      [SRC_CASH]:{coa_account_id:TARGET_CASH,account_class:'ASSET'},
      [SRC_BANK]:{coa_account_id:TARGET_BANK,account_class:'ASSET'},
    },
    categories:{
      [CAT_REVENUE]:{coa_account_id:TARGET_REVENUE,account_class:'REVENUE',treatment:'earned_revenue'},
      [CAT_EXPENSE]:{coa_account_id:TARGET_EXPENSE,account_class:'EXPENSE',treatment:'operating_expense'},
    },
    periods:[{period_id:PERIOD,start:'2026-11-01',end:'2026-11-30'}],
    duplicate_reviewed_source_ids:[],
  };
}
const opts={environment:'disposable-in-memory-postgres',synthetic_fixture_only:true};

describe('AQVORA source to V2 journal rehearsal (synthetic, isolated)',()=>{
  it('builds exact, bounded journal requests and refuses any real source or incomplete review',()=>{
    const source=syntheticSource(),policy=syntheticPolicy(source);
    const review=prepareDisposableHistoricalJournalRehearsal(source,policy,opts);
    expect(review.status).toBe('DISPOSABLE_SYNTHETIC_REHEARSAL_ONLY');
    expect(review.expected_journals).toBe(3);
    expect(review.expected_total_debit_minor).toBe('80000');
    expect(review.expected_total_credit_minor).toBe('80000');
    expect(review.real_import_allowed).toBe(false);
    expect(review.requests[0].lines).toEqual([
      {account_id:TARGET_CASH,debit_minor:'50000',credit_minor:'0'},
      {account_id:TARGET_REVENUE,debit_minor:'0',credit_minor:'50000'},
    ]);
    expect(review.requests[2].lines).toEqual([
      {account_id:TARGET_BANK,debit_minor:'10000',credit_minor:'0'},
      {account_id:TARGET_CASH,debit_minor:'0',credit_minor:'10000'},
    ]);
    expect(review.requests.every((r:{intent_key:string})=>
      /^legacy:[a-f0-9]{64}$/.test(r.intent_key))).toBe(true);
    expect(()=>prepareDisposableHistoricalJournalRehearsal(source,policy,{
      environment:'production',synthetic_fixture_only:true,
    })).toThrow(/Only distinct-tenant synthetic/);
    const real=syntheticSource(),realPolicy=syntheticPolicy(real);
    real.source_project_ref='real-production-business';
    realPolicy.source_project_ref='real-production-business';
    expect(()=>prepareDisposableHistoricalJournalRehearsal(real,realPolicy,opts))
      .toThrow(/Only distinct-tenant synthetic/);
    const draft=syntheticSource();
    draft.transaction_drafts.push({id:'aaaa0000-aaaa-4aaa-8aaa-000000000100',
      organization_id:SOURCE,amount_paisa:'100'} as never);
    expect(()=>prepareDisposableHistoricalJournalRehearsal(draft,syntheticPolicy(draft),opts))
      .toThrow(/complete clean source parity/);
  });

  it('posts only in ephemeral PGlite via the real V2 RPC, replays receipts and matches GL/TB',async()=>{
    const source=syntheticSource();
    const rehearsal=prepareDisposableHistoricalJournalRehearsal(source,syntheticPolicy(source),opts);
    const db=new PGlite({extensions:{uuid_ossp}});
    try {
      await db.exec([
        'CREATE ROLE anon;',
        'CREATE ROLE authenticated;',
        'CREATE SCHEMA auth;',
        "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');",
        'CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);',
        'CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text);',
        "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
        "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true)) $$;",
        'GRANT USAGE ON SCHEMA auth TO authenticated;',
      ].join('\n'));
      await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'synthetic@aqvora.example')",[USER]);
      await db.query('INSERT INTO auth.sessions(id,user_id) VALUES ($1,$1)',[USER]);
      const root=new URL('../supabase/migrations/',import.meta.url);
      for(const name of readdirSync(root).filter(x=>x.endsWith('.sql')).sort()){
        try{await db.exec(readFileSync(new URL(name,root),'utf8'));}
        catch(err){throw new Error('Isolated SQL migration failed: '+name,{cause:err});}
      }
      await db.query("INSERT INTO public.organizations(id,name,owner_name,currency) VALUES($1,'SYNTHETIC CI ONLY','Owner','PKR')",[TARGET]);
      await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES ($1,$2,'OWNER',true)",[TARGET,USER]);
      await db.query('INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)',[TARGET]);
      await db.query("INSERT INTO public.aqvora_periods(organization_id,id,starts_on,ends_on,state) VALUES($1,$2,'2026-11-01','2026-11-30','open')",[TARGET,PERIOD]);
      for(const [id,code,name,cls,side] of [
        [TARGET_CASH,'1000','Cash','asset','debit'],
        [TARGET_BANK,'1010','Bank','asset','debit'],
        [TARGET_REVENUE,'4000','Income','revenue','credit'],
        [TARGET_EXPENSE,'5000','Expense','expense','debit'],
      ]){
        await db.query("INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting) VALUES($1,$2,$3,$4,$5,$6,true)",
          [TARGET,id,code,name,cls,side]);
      }
      await db.exec(currencySeedSql(TARGET,USER));
      await db.exec('BEGIN');
      await db.exec('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.aal','aal2',true),set_config('request.jwt.claim.session_id',$1,true)",[USER]);
      const receipts:string[]=[];
      for(const request of rehearsal.requests){
        const args=[request.organization_id,request.intent_key,request.business_date,JSON.stringify(request.lines)];
        const first=await db.query<{receipt:{journal_id:string}}>(
          'SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb) AS receipt',args);
        const retry=await db.query<{receipt:{journal_id:string}}>(
          'SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb) AS receipt',args);
        const recovery=await db.query<{receipt:{journal_id:string}}>(
          'SELECT public.lookup_aqvora_receipt($1,$2) AS receipt',[request.organization_id,request.intent_key]);
        expect(first.rows[0].receipt.journal_id).toBeTruthy();
        expect(retry.rows[0].receipt.journal_id).toBe(first.rows[0].receipt.journal_id);
        expect(recovery.rows[0].receipt.journal_id).toBe(first.rows[0].receipt.journal_id);
        receipts.push(first.rows[0].receipt.journal_id);
      }
      expect(new Set(receipts).size).toBe(3);
      await db.exec('SAVEPOINT replay_tamper');
      const original=rehearsal.requests[0];
      await expect(db.query('SELECT public.post_aqvora_journal($1,$2,$3::date,$4::jsonb)',[
        TARGET,original.intent_key,original.business_date,JSON.stringify([
          {account_id:TARGET_CASH,debit_minor:'1',credit_minor:'0'},
          {account_id:TARGET_REVENUE,debit_minor:'0',credit_minor:'1'},
        ]),
      ])).rejects.toThrow(/idempotency|payload mismatch/i);
      await db.exec('ROLLBACK TO SAVEPOINT replay_tamper');
      await db.exec('RELEASE SAVEPOINT replay_tamper');
      const aggregate=await db.query<{journals:number;receipts:number;lines:number;debit:string;credit:string}>(
        "SELECT (SELECT count(*)::int FROM public.aqvora_journals) journals,"+
        "(SELECT count(*)::int FROM public.aqvora_posting_receipts) receipts,"+
        "(SELECT count(*)::int FROM public.aqvora_journal_lines) lines,"+
        "(SELECT sum(debit_minor)::text FROM public.aqvora_journal_lines) debit,"+
        "(SELECT sum(credit_minor)::text FROM public.aqvora_journal_lines) credit");
      expect(aggregate.rows[0]).toEqual({
        journals:3,receipts:3,lines:6,debit:'80000',credit:'80000'});
      const balances=await db.query<{id:string;net:string}>(
        "SELECT account_id::text id,sum(debit_minor-credit_minor)::text net FROM public.aqvora_journal_lines GROUP BY account_id ORDER BY account_id");
      expect(Object.fromEntries(balances.rows.map(x=>[x.id,x.net]))).toEqual({
        [TARGET_CASH]:'20000',[TARGET_BANK]:'10000',
        [TARGET_REVENUE]:'-50000',[TARGET_EXPENSE]:'20000',
      });
      const tb=await db.query<{report:{totals:{debit_minor:string;credit_minor:string}}}>(
        'SELECT public.read_aqvora_trial_balance($1,$2,$3,$4) AS report',
        [TARGET,'2026-11-01','2026-11-30','PKR']);
      expect(tb.rows[0].report.totals).toMatchObject({debit_minor:'80000',credit_minor:'80000'});
      await db.exec('COMMIT');
    } finally{await db.close();}
  },120000);
});
