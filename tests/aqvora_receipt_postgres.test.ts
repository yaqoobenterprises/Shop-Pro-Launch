// @vitest-environment node
import {Client} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertDisposablePostgres} from "./support/assertDisposablePostgres";
import {receiptMigrationSql,receiptSeedSql,readIds as i,serviceLines,type CashDoc,type ReceiptDoc,type ReceiptIssue} from "./support/aqvoraReceiptFixture";
import {salesFixtureSql,type SalesDocument} from "./support/aqvoraSalesFixture";
const databaseUrl=process.env.AQVORA_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Receipt settlement on independent PostgreSQL sessions",()=>{
  let controller:Client;let admin:Client;let created=false;let serial=0;const clients=new Set<Client>();
  let upgradeBefore:unknown;let upgradeAfter:unknown;
  const key=()=>`pg-receipt-${++serial}`;
  const open=async()=>{const url=new URL(databaseUrl!);url.pathname="/aqvora_receipt_fixture";
    const c=new Client({connectionString:url.toString()});await c.connect();clients.add(c);return c;};
  const close=async(c:Client)=>{await c.query("ROLLBACK");await c.end();clients.delete(c);};
  const user=async(actor=i.manager)=>{const c=await open();await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c,actor);return c;};
  const claims=async(c:Client,actor:string)=>c.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
    set_config('request.jwt.claim.aal','aal2',true),set_config('request.jwt.claim.session_id',$1,true)`,[actor]);
  const commit=async(c:Client)=>{await c.query("COMMIT");await close(c);};
  const customer=async()=>{const c=await user();const id=(await c.query<{r:{id:string}}>(
    "SELECT public.create_aqvora_customer($1,$2,'Synthetic receipt customer') r",[i.org,key()])).rows[0].r.id;await commit(c);return id;};
  const invoice=async(party:string,amount="101")=>{const c=await user();let d=(await c.query<{r:SalesDocument}>(
    "SELECT public.create_aqvora_sales_draft($1,$2,$3,'2026-11-18','2026-12-20','PKR',$4::jsonb) r",
    [i.org,key(),party,JSON.stringify([{...serviceLines[0],unit_price_minor:amount}])])).rows[0].r;
    d=(await c.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'submit') r",[i.org,d.id,d.revision])).rows[0].r;
    await claims(c,i.owner);d=(await c.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'approve') r",[i.org,d.id,d.revision])).rows[0].r;
    await claims(c,i.manager);await c.query("SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,$5)",[i.org,d.id,d.revision,d.fingerprint,key()]);
    await commit(c);return d;};
  const cash=async(party:string,amount="101")=>{const c=await user();let d=(await c.query<{r:CashDoc}>(
    "SELECT public.create_aqvora_cash_collection($1,$2,$3,'2026-11-20','PKR',$4::jsonb,'controlled_cash') r",[i.org,key(),party,JSON.stringify(amount)])).rows[0].r;
    await claims(c,i.owner);d=(await c.query<{r:CashDoc}>(
      "SELECT public.confirm_aqvora_cash_collection($1,$2,$3,$4::jsonb,'cash_counted_in_person') r",[i.org,d.id,d.revision,JSON.stringify(amount)])).rows[0].r;
    await commit(c);return d;};
  const draft=async(c:Client,source:CashDoc,allocations:object[])=>(await c.query<{r:ReceiptDoc}>(
    "SELECT public.create_aqvora_customer_receipt_draft($1,$2,$3,$4::jsonb) r",[i.org,key(),source.id,JSON.stringify(allocations)])).rows[0].r;
  const prepare=async(source:CashDoc,allocations:object[])=>{const c=await user();let d=await draft(c,source,allocations);
    d=(await c.query<{r:ReceiptDoc}>("SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'submit') r",[i.org,d.id,d.revision])).rows[0].r;
    await claims(c,i.owner);d=(await c.query<{r:ReceiptDoc}>("SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'approve') r",[i.org,d.id,d.revision])).rows[0].r;
    await commit(c);return d;};
  const post=async(c:Client,d:ReceiptDoc,intent=key())=>(await c.query<{r:ReceiptIssue}>(
    "SELECT public.post_aqvora_customer_receipt($1,$2,$3,$4,$5) r",[i.org,d.id,d.revision,d.fingerprint,intent])).rows[0].r;
  const pendingBlock=async(c:Client)=>{for(let n=0;n<200;n++){
    if((await admin.query("SELECT cardinality(pg_blocking_pids($1))>0 blocked",[c.processID])).rows[0].blocked)return;
    await new Promise(r=>setTimeout(r,10));}throw new Error("Expected blocked receipt backend");};
  const single=async(amount="101")=>{const party=await customer();const inv=await invoice(party);return {
    party,inv,receipt:await prepare(await cash(party,amount),[{invoice_id:inv.id,amount_minor:amount}])};};
  beforeAll(async()=>{assertDisposablePostgres(databaseUrl);controller=new Client({connectionString:databaseUrl});await controller.connect();
    await controller.query("CREATE DATABASE aqvora_receipt_fixture");created=true;admin=await open();
    await admin.query(salesFixtureSql().replace("CREATE ROLE anon; CREATE ROLE authenticated;",()=>`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));
    await invoice(await customer());
    const history=async()=>(await admin.query(`SELECT jsonb_agg(to_jsonb(j)-'sales_source_id'-'receipt_source_id' ORDER BY id) rows FROM public.aqvora_journals j`)).rows[0].rows;
    upgradeBefore=await history();await admin.query("ALTER TABLE public.organizations ADD COLUMN timezone text DEFAULT 'UTC'");
    await admin.query(receiptMigrationSql());upgradeAfter=await history();
    expect((await admin.query("SELECT * FROM private.aqvora_receipt_policies")).rows).toEqual([]);
    await admin.query(receiptSeedSql());});
  afterAll(async()=>{await Promise.all([...clients].map(close));if(created)await controller.query("DROP DATABASE aqvora_receipt_fixture");
    if(controller)await controller.end();});
  it("upgrades populated #59 sources without changing any original journal field",()=>expect(upgradeAfter).toEqual(upgradeBefore));
  it("serializes two receipts for one invoice and exposes only committed allocations to concurrent readers",async()=>{
    const {party,inv,receipt:a}=await single("70");const b=await prepare(await cash(party,"70"),[{invoice_id:inv.id,amount_minor:"70"}]);
    const one=await user();const two=await user();await post(one,a);
    const pending=post(two,b);const rejected=expect(pending).rejects.toThrow("over-allocation");await pendingBlock(two);
    const reader=await user();expect((await reader.query("SELECT public.get_aqvora_invoice_open_balance($1,$2,'2026-11-20') r",[i.org,inv.id])).rows[0].r.outstanding_minor).toBe("101");
    await commit(one);await rejected;await close(two);
    expect((await reader.query("SELECT public.get_aqvora_invoice_open_balance($1,$2,'2026-11-20') r",[i.org,inv.id])).rows[0].r.outstanding_minor).toBe("31");await commit(reader);
    expect((await admin.query("SELECT state,journal_id FROM public.aqvora_customer_receipts WHERE organization_id=$1 AND id=$2",[i.org,b.id])).rows[0]).toEqual({state:"approved",journal_id:null});
  });
  it("locks one collection against competing allocations to different invoices",async()=>{
    const party=await customer();const x=await invoice(party);const y=await invoice(party);const source=await cash(party);
    const a=await user();const b=await user();await draft(a,source,[{invoice_id:x.id,amount_minor:"101"}]);
    const pending=draft(b,source,[{invoice_id:y.id,amount_minor:"101"}]);const rejected=expect(pending).rejects.toMatchObject({code:"23505"});
    await pendingBlock(b);await commit(a);await rejected;await close(b);
    expect((await admin.query("SELECT count(*)::int n FROM public.aqvora_customer_receipts WHERE organization_id=$1 AND collection_id=$2",[i.org,source.id])).rows[0].n).toBe(1);
  });
  it("returns the identical durable receipt to simultaneous same-intent requests",async()=>{
    const {receipt}=await single();const a=await user();const b=await user();const intent=key();const first=await post(a,receipt,intent);
    const pending=post(b,receipt,intent);await pendingBlock(b);await commit(a);expect(await pending).toEqual(first);await commit(b);
    expect(first.allocations[0].allocation_id).toBeTruthy();
  });
  it("rejects a second posting intent against the same immutable receipt",async()=>{
    const {receipt}=await single();const a=await user();const b=await user();await post(a,receipt);
    const pending=post(b,receipt);const rejected=expect(pending).rejects.toThrow("immutable");await pendingBlock(b);await commit(a);await rejected;await close(b);
  });
  it("rolls back source, allocation, journal and receipt number on an intent collision",async()=>{
    const {receipt:a}=await single();const {receipt:b}=await single();const one=await user();const two=await user();const intent=key();const first=await post(one,a,intent);
    const pending=post(two,b,intent);const rejected=expect(pending).rejects.toMatchObject({code:"23505"});await pendingBlock(two);await commit(one);await rejected;await close(two);
    const state=(await admin.query(`SELECT r.state,r.journal_id,(SELECT count(*)::int FROM public.aqvora_receipt_allocations WHERE organization_id=$1 AND receipt_id=$2) n
      FROM public.aqvora_customer_receipts r WHERE organization_id=$1 AND id=$2`,[i.org,b.id])).rows[0];expect(state).toEqual({state:"approved",journal_id:null,n:0});
    const retry=await user();const next=await post(retry,b);await commit(retry);expect(BigInt(next.receipt_number.slice(3))).toBe(BigInt(first.receipt_number.slice(3))+1n);
  });
  it("orders overlapping multi-invoice locks independently of client allocation order",async()=>{
    const party=await customer();const x=await invoice(party);const y=await invoice(party);
    const a=await prepare(await cash(party,"80"),[{invoice_id:x.id,amount_minor:"40"},{invoice_id:y.id,amount_minor:"40"}]);
    const b=await prepare(await cash(party,"80"),[{invoice_id:y.id,amount_minor:"40"},{invoice_id:x.id,amount_minor:"40"}]);
    const one=await user();const two=await user();await post(one,a);const pending=post(two,b);await pendingBlock(two);await commit(one);await pending;await commit(two);
    const reader=await user();for(const inv of [x,y])expect((await reader.query("SELECT public.get_aqvora_invoice_open_balance($1,$2,'2026-11-20') r",[i.org,inv.id])).rows[0].r.outstanding_minor).toBe("21");await commit(reader);
  });
  it("serializes closure with receipt posting and retains exact lost-ACK recovery after close",async()=>{
    const {receipt}=await single();const {receipt:later}=await single();const a=await user();const b=await user(i.owner);const intent=key();const first=await post(a,receipt,intent);
    const period=(await admin.query("SELECT id FROM public.aqvora_periods WHERE organization_id=$1",[i.org])).rows[0].id;
    const closing=b.query("SELECT public.close_aqvora_period($1,$2,1,'Synthetic close')",[i.org,period]);await pendingBlock(b);await commit(a);await closing;await commit(b);
    const denied=await user();await expect(post(denied,later)).rejects.toThrow("closed");await close(denied);
    const retry=await user();expect(await post(retry,receipt,intent)).toEqual(first);await commit(retry);
    const opener=await user(i.owner);await opener.query("SELECT public.reopen_aqvora_period($1,$2,2,'Synthetic reopen')",[i.org,period]);await commit(opener);
  });
  it.each(["issuer","checker","session","enrollment"])("rechecks %s revocation after waiting on its lock",async(kind)=>{
    const {receipt}=await single();const changer=await open();await changer.query("BEGIN");
    if(kind==="session")await changer.query("DELETE FROM auth.sessions WHERE user_id=$1",[i.manager]);
    else if(kind==="enrollment")await changer.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);
    else await changer.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2",[i.org,kind==="issuer"?i.manager:i.owner]);
    const c=await user();const pending=post(c,receipt);const rejected=expect(pending).rejects.toThrow(/authorized|checker|revoked|not enabled/);
    await pendingBlock(c);await commit(changer);await rejected;await close(c);
    await admin.query("UPDATE public.organization_members SET role=CASE WHEN user_id=$2 THEN 'OWNER' ELSE 'MANAGER' END WHERE organization_id=$1 AND user_id IN ($2,$3)",[i.org,i.owner,i.manager]);
    await admin.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1) ON CONFLICT DO NOTHING",[i.manager]);
    await admin.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1) ON CONFLICT DO NOTHING",[i.org]);
    expect((await admin.query("SELECT state FROM public.aqvora_customer_receipts WHERE organization_id=$1 AND id=$2",[i.org,receipt.id])).rows[0].state).toBe("approved");
  });
  it("posts 120 independent open items and records indexed source/allocation query plans",async()=>{
    const party=await customer();const durations:number[]=[];let last:SalesDocument|undefined;
    for(let n=0;n<120;n++){last=await invoice(party);const r=await prepare(await cash(party,"1"),[{invoice_id:last.id,amount_minor:"1"}]);
      const c=await user();const start=performance.now();await post(c,r);await commit(c);durations.push(performance.now()-start);}
    await admin.query("ANALYZE public.aqvora_receipt_allocations;ANALYZE public.aqvora_customer_receipts");
    const plan=await admin.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM public.aqvora_receipt_allocations WHERE organization_id=$1 AND invoice_id=$2",[i.org,last!.id]);
    expect(JSON.stringify(plan.rows[0])).toContain("aqvora_allocations_invoice");
    const indexes=await admin.query("SELECT indexdef FROM pg_indexes WHERE tablename='aqvora_customer_receipts'");
    expect(JSON.stringify(indexes.rows)).toContain("jsonb_path_ops");
    console.info("AQVORA receipt posting timings ms",{first20:durations.slice(0,20),last20:durations.slice(-20)},"allocation plan",JSON.stringify(plan.rows[0]));
    expect(Math.max(...durations.slice(-20))).toBeLessThan(15000);
    const c=await user();const report=(await c.query("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20',$2) r",[i.org,party])).rows[0].r;
    expect(report).toMatchObject({face_minor:"12120",allocated_minor:"120",outstanding_minor:"12000",ar_control_minor:"12000"});await commit(c);
  },120000);
});
