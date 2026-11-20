// @vitest-environment node
import {Client} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertDisposablePostgres} from "./support/assertDisposablePostgres";
import {salesFixtureSql,serviceLines,readIds as i,type SalesDocument,type SalesReceipt} from "./support/aqvoraSalesFixture";
const databaseUrl=process.env.AQVORA_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Verified sales on independent PostgreSQL sessions",()=>{
  let controller:Client;let admin:Client;let created=false;let serial=0;const clients=new Set<Client>();
  const key=()=>`pg-sales-${++serial}`;
  const open=async()=>{const url=new URL(databaseUrl!);url.pathname="/aqvora_sales_fixture";
    const c=new Client({connectionString:url.toString()});await c.connect();clients.add(c);return c;};
  const close=async(c:Client)=>{await c.query("ROLLBACK");await c.end();clients.delete(c);};
  const user=async(actor=i.manager)=>{const c=await open();await c.query("BEGIN;SET LOCAL ROLE authenticated");
    await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.aal','aal2',true),
      set_config('request.jwt.claim.session_id',$1,true)`,[actor]);return c;};
  const commit=async(c:Client)=>{await c.query("COMMIT");await close(c);};
  const transition=async(c:Client,d:SalesDocument,action:string)=>(await c.query<{r:SalesDocument}>(
    "SELECT public.transition_aqvora_sales_invoice($1,$2,$3,$4) r",[i.org,d.id,d.revision,action])).rows[0].r;
  const draft=async()=>{const c=await user();const customer=(await c.query<{r:{id:string}}>(
    "SELECT public.create_aqvora_customer($1,$2,'Synthetic') r",[i.org,key()])).rows[0].r.id;
    const d=(await c.query<{r:SalesDocument}>("SELECT public.create_aqvora_sales_draft($1,$2,$3,'2026-11-20','2026-12-20','PKR',$4::jsonb) r",
      [i.org,key(),customer,JSON.stringify(serviceLines)])).rows[0].r;await commit(c);return d;};
  const prepare=async()=>{const d=await draft();const maker=await user();const submitted=await transition(maker,d,"submit");
    await commit(maker);const checker=await user(i.owner);const approved=await transition(checker,submitted,"approve");
    await commit(checker);return approved;};
  const issue=async(c:Client,d:SalesDocument,intent:string)=>(await c.query<{r:SalesReceipt}>(
    "SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,$5) r",[i.org,d.id,d.revision,d.fingerprint,intent])).rows[0].r;
  const blocked=async(c:Client)=>{for(let n=0;n<150;n++){
    const r=await admin.query("SELECT cardinality(pg_blocking_pids($1))>0 blocked",[c.processID]);
    if(r.rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}throw new Error("Expected blocked PostgreSQL backend");};
  beforeAll(async()=>{assertDisposablePostgres(databaseUrl);controller=new Client({connectionString:databaseUrl});await controller.connect();
    await controller.query("CREATE DATABASE aqvora_sales_fixture");created=true;admin=await open();
    await admin.query(salesFixtureSql().replace("CREATE ROLE anon; CREATE ROLE authenticated;",()=>`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));});
  afterAll(async()=>{await Promise.all([...clients].map(close));if(created)await controller.query("DROP DATABASE aqvora_sales_fixture");
    if(controller)await controller.end();});
  it("commits one invoice/journal/number for simultaneous identical issue intents",async()=>{
    const d=await prepare();const a=await user();const b=await user();const intent=key();const first=await issue(a,d,intent);
    const pending=issue(b,d,intent);await blocked(b);await commit(a);expect(await pending).toEqual(first);await commit(b);
    const count=await admin.query("SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1 AND source_id=$2",[i.org,d.id]);
    expect(count.rows[0].n).toBe(1);
  });
  it("rejects a competing second intent on one immutable issued source",async()=>{
    const d=await prepare();const a=await user();const b=await user();await issue(a,d,key());
    const pending=issue(b,d,key());const rejected=expect(pending).rejects.toThrow("immutable");await blocked(b);await commit(a);await rejected;await close(b);
  });
  it("rolls back the journal, source and sequence on intent collision across different invoices",async()=>{
    const one=await prepare();const two=await prepare();const a=await user();const b=await user();const intent=key();const first=await issue(a,one,intent);
    const pending=issue(b,two,intent);const rejected=expect(pending).rejects.toMatchObject({code:"23505"});
    await blocked(b);await commit(a);await rejected;await close(b);
    const d=(await admin.query("SELECT state,journal_id FROM public.aqvora_sales_invoices WHERE organization_id=$1 AND id=$2",[i.org,two.id])).rows[0];
    expect(d).toEqual({state:"approved",journal_id:null});
    expect((await admin.query("SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1 AND source_id=$2",[i.org,two.id])).rows[0].n).toBe(0);
    const retry=await user();const next=await issue(retry,two,key());await commit(retry);
    expect(BigInt(next.document_number.slice(3))).toBe(BigInt(first.document_number.slice(3))+1n);
  });
  it("serializes draft replacement against submission and rejects the stale revision",async()=>{
    const d=await draft();const a=await user();const b=await user();
    await a.query("SELECT public.edit_aqvora_sales_draft($1,$2,$3,$4,'2026-11-20','2026-12-20','PKR',$5::jsonb)",
      [i.org,d.id,d.revision,d.customer_id,JSON.stringify([{...serviceLines[0],unit_price_minor:"202"}])]);
    const pending=transition(b,d,"submit");const rejected=expect(pending).rejects.toThrow("stale");
    await blocked(b);await commit(a);await rejected;await close(b);
  });
  it("serializes period closure with issue in both orders and preserves post-close recovery",async()=>{
    const d=await prepare();const later=await prepare();const issuer=await user();const closer=await user(i.owner);
    const intent=key();const receipt=await issue(issuer,d,intent);
    const period=(await admin.query("SELECT id FROM public.aqvora_periods WHERE organization_id=$1",[i.org])).rows[0].id;
    const closing=closer.query("SELECT public.close_aqvora_period($1,$2,1,'Synthetic close')",[i.org,period]);
    await blocked(closer);await commit(issuer);await closing;await commit(closer);
    const denied=await user();await expect(issue(denied,later,key())).rejects.toThrow("closed");await close(denied);
    const retry=await user();expect(await issue(retry,d,intent)).toEqual(receipt);await commit(retry);
    const opener=await user(i.owner);await opener.query("SELECT public.reopen_aqvora_period($1,$2,2,'Synthetic reopen')",[i.org,period]);await commit(opener);
  });
  it.each(["issuer","checker","session"])("rechecks %s revocation after lock acquisition",async(kind)=>{
    const d=await prepare();const changer=await open();await changer.query("BEGIN");
    if(kind==="session")await changer.query("DELETE FROM auth.sessions WHERE user_id=$1",[i.manager]);
    else await changer.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2",
      [i.org,kind==="issuer"?i.manager:i.owner]);
    const issuer=await user();const pending=issue(issuer,d,key());const rejected=expect(pending).rejects.toThrow(/authorized|checker|revoked/);
    await blocked(issuer);await commit(changer);await rejected;await close(issuer);
    await admin.query("UPDATE public.organization_members SET role=CASE WHEN user_id=$2 THEN 'OWNER' ELSE 'MANAGER' END WHERE organization_id=$1 AND user_id IN ($2,$3)",[i.org,i.owner,i.manager]);
    await admin.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1) ON CONFLICT DO NOTHING",[i.manager]);
  });
  it("rolls back all source writes when enrollment disablement wins the race",async()=>{
    const d=await prepare();const changer=await open();await changer.query("BEGIN");
    await changer.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1",[i.org]);
    const issuer=await user();const pending=issue(issuer,d,key());const rejected=expect(pending).rejects.toThrow("not enabled");
    await blocked(issuer);await commit(changer);await rejected;await close(issuer);
    await admin.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)",[i.org]);
  });
  it("records a company-scoped invoice query plan and verifies source reads across independent sessions",async()=>{
    const d=await prepare();const issuer=await user();await issue(issuer,d,key());await commit(issuer);
    // Populate both tenants through guarded APIs; the point read must remain
    // indexed rather than inspecting unrelated companies' source rows.
    for(const [actor,org] of [[i.manager,i.org],[i.outsider,i.otherOrg]]){
      const loader=await user(actor);const customer=(await loader.query<{r:{id:string}}>(
        "SELECT public.create_aqvora_customer($1,'SCALE','Synthetic scale customer') r",[org])).rows[0].r.id;
      await loader.query(`SELECT public.create_aqvora_sales_draft($1,'scale-' || n,$2,
        '2026-11-20','2026-12-20','PKR',$3::jsonb) FROM generate_series(1,1000) n`,[org,customer,JSON.stringify(serviceLines)]);
      await commit(loader);
    }
    await admin.query("ANALYZE public.aqvora_sales_invoices");
    const plan=await admin.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM public.aqvora_sales_invoices WHERE organization_id=$1 AND id=$2",[i.org,d.id]);
    expect(JSON.stringify(plan.rows[0])).toContain("organization_id");
    expect(JSON.stringify(plan.rows[0])).toContain("aqvora_sales_invoices_pkey");
    console.info("AQVORA sales source plan",JSON.stringify(plan.rows[0]));
    const reader=await user(i.owner);const invoice=await reader.query<{r:SalesDocument}>("SELECT public.get_aqvora_sales_invoice($1,$2) r",[i.org,d.id]);
    expect(invoice.rows[0].r.reconciliation?.ar_debit_minor).toBe("101");await commit(reader);
  },60000);
});
