import type {Client} from "pg";
import {salesSeedSql,serviceLines,type SalesDocument,type SalesReceipt} from "./aqvoraSalesFixture";
const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner="11111111-1111-4111-8111-111111111111";
const maker="99999999-9999-4999-8999-999999999999";
const revenue="33333333-3333-4333-8333-333333333333";
const claims=async(c:Client,actor:string)=>c.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
  set_config('request.jwt.claim.aal','aal2',true),set_config('request.jwt.claim.session_id',$1,true)`,[actor]);
export async function seedRecoverySales(c:Client){
  await c.query("INSERT INTO auth.users(id,email) VALUES($1,'recovery-maker@example.test')",[maker]);
  await c.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$1)",[maker]);
  await c.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'MANAGER',true)",[org,maker]);
  await c.query(salesSeedSql(org,owner,revenue));
  await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c,maker);
  const customer=(await c.query<{r:{id:string}}>("SELECT public.create_aqvora_customer($1,'RECOVERY','Recovery customer') r",[org])).rows[0].r.id;
  let d=(await c.query<{r:SalesDocument}>("SELECT public.create_aqvora_sales_draft($1,'recovery-draft',$2,'2026-11-20','2026-11-30','PKR',$3::jsonb) r",
    [org,customer,JSON.stringify(serviceLines)])).rows[0].r;
  d=(await c.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'submit') r",[org,d.id,d.revision])).rows[0].r;
  await claims(c,owner);
  d=(await c.query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,'approve') r",[org,d.id,d.revision])).rows[0].r;
  await claims(c,maker);
  const receipt=(await c.query<{r:SalesReceipt}>("SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,'recovery-issue') r",
    [org,d.id,d.revision,d.fingerprint])).rows[0].r;
  await c.query("COMMIT");return receipt;
}
export async function verifyRestoredSales(c:Client){
  await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c,maker);
  const receipt=(await c.query<{r:SalesReceipt&{fingerprint:string}}>("SELECT public.lookup_aqvora_sales_issue($1,'recovery-issue') r",[org])).rows[0].r;
  const source=(await c.query<{r:SalesDocument}>("SELECT public.get_aqvora_sales_invoice($1,$2) r",[org,receipt.invoice_id])).rows[0].r;
  const replay=(await c.query<{r:SalesReceipt}>("SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,'recovery-issue') r",
    [org,receipt.invoice_id,receipt.source_revision,receipt.fingerprint])).rows[0].r;
  await c.query("COMMIT");return {receipt,source,replay};
}
