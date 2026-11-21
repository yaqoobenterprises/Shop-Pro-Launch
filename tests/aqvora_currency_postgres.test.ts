// @vitest-environment node
import {Client} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertDisposablePostgres} from "./support/assertDisposablePostgres";
import {currencyFixtureSql,currencySeedSql,readIds as i} from "./support/aqvoraCurrencyFixture";
import {receiptCash,serviceLines,type ReceiptDoc,type CashDoc} from "./support/aqvoraReceiptFixture";
import type {SalesDocument} from "./support/aqvoraSalesFixture";
import type {CurrencyUnitPolicy} from "../src/accounting/currencyContracts";

const databaseUrl=process.env.AQVORA_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Currency policy on independent PostgreSQL connections",()=>{
  let controller:Client;let admin:Client;let created=false;let serial=0;
  const clients=new Set<Client>();const key=()=>`currency-pg-${++serial}`;
  const open=async()=>{const url=new URL(databaseUrl!);url.pathname="/aqvora_currency_fixture";
    const c=new Client({connectionString:url.toString()});await c.connect();clients.add(c);return c;};
  const close=async(c:Client)=>{await c.query("ROLLBACK");await c.end();clients.delete(c);};
  const commit=async(c:Client)=>{await c.query("COMMIT");await close(c);};
  const claims=async(c:Client,actor=i.manager)=>c.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
    set_config('request.jwt.claim.aal','aal2',true),set_config('request.jwt.claim.session_id',$1,true)`,[actor]);
  const user=async()=>{const c=await open();await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c);return c;};
  const result=async<T>(c:Client,sql:string,args:unknown[]=[]) => (await c.query<{r:T}>(sql,args)).rows[0].r;
  const post=async(c:Client,date="2026-11-20",intent=key())=>result<{journal_id:string;currency_policy:CurrencyUnitPolicy}>(c,
    "SELECT public.post_aqvora_journal($1,$2,$3,$4::jsonb) r",[i.org,intent,date,JSON.stringify([
      {account_id:receiptCash,debit_minor:"101",credit_minor:"0"},{account_id:i.sales,debit_minor:"0",credit_minor:"101"}])]);
  const blocked=async(c:Client)=>{const pid=(await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;return pid;};
  const waitLock=async(pid:number)=>{
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){const row=(await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
      if(row?.wait_event_type==="Lock")return;await new Promise(resolve=>setTimeout(resolve,25));}
    throw new Error("Expected independent connection to wait on a PostgreSQL lock");
  };
  const preparedInvoice=async()=>{const c=await user();
    const customer=await result<{id:string}>(c,"SELECT public.create_aqvora_customer($1,$2,'Currency race fixture') r",[i.org,key()]);
    let d=await result<SalesDocument>(c,"SELECT public.create_aqvora_sales_draft($1,$2,$3,'2026-11-18','2026-12-20','PKR',$4::jsonb) r",
      [i.org,key(),customer.id,JSON.stringify(serviceLines)]);
    d=await result<SalesDocument>(c,"SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'submit') r",[i.org,d.id,d.revision]);
    await claims(c,i.owner);d=await result<SalesDocument>(c,"SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'approve') r",[i.org,d.id,d.revision]);
    await commit(c);return {d,customer:customer.id};};
  const issue=async(c:Client,d:SalesDocument)=>result<{currency_policy:CurrencyUnitPolicy}>(c,
    "SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,$5) r",[i.org,d.id,d.revision,d.fingerprint,key()]);
  const preparedReceipt=async()=>{const {d,customer}=await preparedInvoice();const c=await user();await issue(c,d);
    let cash=await result<CashDoc>(c,"SELECT public.create_aqvora_cash_collection($1,$2,$3,'2026-11-20','PKR','\"60\"'::jsonb,'controlled_cash') r",[i.org,key(),customer]);
    await claims(c,i.owner);cash=await result<CashDoc>(c,"SELECT public.confirm_aqvora_cash_collection($1,$2,$3,'\"60\"'::jsonb,'cash_counted_in_person') r",[i.org,cash.id,cash.revision]);
    await claims(c);let receipt=await result<ReceiptDoc>(c,"SELECT public.create_aqvora_customer_receipt_draft($1,$2,$3,$4::jsonb) r",
      [i.org,key(),cash.id,JSON.stringify([{invoice_id:d.id,amount_minor:"60"}])]);
    receipt=await result<ReceiptDoc>(c,"SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'submit') r",[i.org,receipt.id,receipt.revision]);
    await claims(c,i.owner);receipt=await result<ReceiptDoc>(c,"SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'approve') r",[i.org,receipt.id,receipt.revision]);
    await commit(c);return receipt;};
  beforeAll(async()=>{assertDisposablePostgres(databaseUrl);controller=new Client({connectionString:databaseUrl});await controller.connect();
    await controller.query("CREATE DATABASE aqvora_currency_fixture");created=true;admin=await open();
    await admin.query(currencyFixtureSql().replace("CREATE ROLE anon; CREATE ROLE authenticated;",()=>`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));
  },60000);
  afterAll(async()=>{for(const c of [...clients])await close(c);if(created)await controller.query("DROP DATABASE aqvora_currency_fixture");if(controller)await controller.end();});

  it("posting wins: a retroactive policy append waits, rechecks committed dates and rolls back",async()=>{
    const a=await user();const first=await post(a);const b=await open();const pid=await blocked(b);
    const pending=b.query(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-11-20"));
    const rejection=expect(pending).rejects.toMatchObject({code:"23514"});await waitLock(pid);await commit(a);await rejection;await close(b);
    expect(first.currency_policy.revision).toBe("1");
    expect((await admin.query("SELECT count(*)::int n FROM private.aqvora_currency_policies WHERE organization_id=$1",[i.org])).rows[0].n).toBe(1);
  });
  it("policy wins: waiting posting sees the new effective revision before committing",async()=>{
    const a=await open();await a.query("BEGIN");await a.query(currencySeedSql(i.org,i.owner,"PKR",2,2,"2026-11-21"));
    const b=await user();const pid=await blocked(b);const pending=post(b,"2026-11-21");await waitLock(pid);await commit(a);
    expect((await pending).currency_policy.revision).toBe("2");await commit(b);
    const reader=await user();expect((await result<{source:{display_complete:boolean}}>(reader,
      "SELECT public.read_aqvora_trial_balance($1,'2026-01-01','2026-12-31','PKR') r",[i.org])).source.display_complete).toBe(true);await close(reader);
  });
  it("serializes optimistic simultaneous policy revisions and rejects the stale loser",async()=>{
    const a=await open();await a.query("BEGIN");await a.query(currencySeedSql(i.org,i.owner,"PKR",2,3,"2026-11-22"));
    const b=await open();const pid=await blocked(b);const pending=b.query(currencySeedSql(i.org,i.owner,"PKR",2,3,"2026-11-23"));
    const rejection=expect(pending).rejects.toMatchObject({code:"23514"});await waitLock(pid);await commit(a);await rejection;await close(b);
  });
  it("serializes invoice issue with policy control and keeps the approved source revision",async()=>{
    const {d}=await preparedInvoice();const a=await user();expect((await issue(a,d)).currency_policy.revision).toBe("1");
    const b=await open();const pid=await blocked(b);const pending=b.query(currencySeedSql(i.org,i.owner,"PKR",2,4,"2026-11-20"));
    const rejection=expect(pending).rejects.toMatchObject({code:"23514"});await waitLock(pid);await commit(a);await rejection;await close(b);
  });
  it("serializes receipt settlement with policy control without reinterpreting invoice units",async()=>{
    const r=await preparedReceipt();const a=await user();const posted=await result<{currency_policy:CurrencyUnitPolicy}>(a,
      "SELECT public.post_aqvora_customer_receipt($1,$2,$3,$4,$5) r",[i.org,r.id,r.revision,r.fingerprint,key()]);
    const b=await open();const pid=await blocked(b);const pending=b.query(currencySeedSql(i.org,i.owner,"PKR",3,4,"2026-12-01"));
    const rejection=expect(pending).rejects.toMatchObject({code:"23514"});await waitLock(pid);await commit(a);await rejection;await close(b);
    expect(posted.currency_policy).toMatchObject({revision:"1",minor_units_per_major:"100"});
  });
  it("restarts every paginated financial reader after policy changes in its cutoff",async()=>{
    const a=await user();const page=await result<{source:{snapshot_token:string};next_cursor:unknown}>(a,
      "SELECT public.read_aqvora_trial_balance($1,'2026-01-01','2026-12-31','PKR',1) r",[i.org]);await commit(a);
    await admin.query(currencySeedSql(i.org,i.owner,"PKR",2,4,"2026-12-01"));
    const b=await user();await expect(b.query("SELECT public.read_aqvora_trial_balance($1,'2026-01-01','2026-12-31','PKR',1,$2::jsonb,$3)",
      [i.org,JSON.stringify(page.next_cursor),page.source.snapshot_token])).rejects.toMatchObject({code:"40001"});await close(b);
  });
  it.each(["REPEATABLE READ","SERIALIZABLE"])("fails closed for unsupported stale write snapshots: %s",async(isolation)=>{
    const c=await open();await c.query(`BEGIN ISOLATION LEVEL ${isolation};SET LOCAL ROLE authenticated`);await claims(c);
    await expect(post(c)).rejects.toMatchObject({code:"40001"});await close(c);
  });
  it("fully rolls back a policy append and financial posting on a late failure",async()=>{
    const c=await open();await c.query("BEGIN");await c.query(currencySeedSql(i.org,i.owner,"PKR",2,5,"2026-12-02"));
    await c.query("SET LOCAL ROLE authenticated");await claims(c);await post(c,"2026-12-02","rolled-back-currency-post");
    await expect(c.query("SELECT 1/0")).rejects.toThrow();await close(c);
    expect((await admin.query("SELECT count(*)::int n FROM private.aqvora_currency_policies WHERE organization_id=$1 AND revision=5",[i.org])).rows[0].n).toBe(0);
    expect((await admin.query("SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1 AND intent_key='rolled-back-currency-post'",[i.org])).rows[0].n).toBe(0);
  });
});
