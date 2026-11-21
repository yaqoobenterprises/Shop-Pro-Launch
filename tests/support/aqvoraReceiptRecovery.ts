import type {Client} from "pg";
import {receiptSeedSql,type CashDoc,type ReceiptDoc,type ReceiptIssue} from "./aqvoraReceiptFixture";
const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner="11111111-1111-4111-8111-111111111111";
const maker="99999999-9999-4999-8999-999999999999";
const claims=async(c:Client,actor:string)=>c.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
  set_config('request.jwt.claim.aal','aal2',true),set_config('request.jwt.claim.session_id',$1,true)`,[actor]);
type DurableReceipt=ReceiptIssue&{source_revision:string;fingerprint:string};
export async function seedRecoveryReceipt(c:Client){
  await c.query(receiptSeedSql(org,owner));await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c,maker);
  const invoice=(await c.query("SELECT public.lookup_aqvora_sales_issue($1,'recovery-issue') r",[org])).rows[0].r;
  let cash=(await c.query<{r:CashDoc}>(`SELECT public.create_aqvora_cash_collection($1,'recovery-cash',$2,
    '2026-11-20','PKR','"40"'::jsonb,'controlled_cash') r`,[org,invoice.customer_id])).rows[0].r;
  await claims(c,owner);cash=(await c.query<{r:CashDoc}>(`SELECT public.confirm_aqvora_cash_collection($1,$2,$3,
    '"40"'::jsonb,'cash_counted_in_person') r`,[org,cash.id,cash.revision])).rows[0].r;
  await claims(c,maker);let d=(await c.query<{r:ReceiptDoc}>(
    "SELECT public.create_aqvora_customer_receipt_draft($1,'recovery-customer-receipt',$2,$3::jsonb) r",
    [org,cash.id,JSON.stringify([{invoice_id:invoice.invoice_id,amount_minor:"40"}])])).rows[0].r;
  d=(await c.query<{r:ReceiptDoc}>("SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'submit') r",[org,d.id,d.revision])).rows[0].r;
  await claims(c,owner);d=(await c.query<{r:ReceiptDoc}>("SELECT public.transition_aqvora_customer_receipt($1,$2,$3,'approve') r",[org,d.id,d.revision])).rows[0].r;
  await claims(c,maker);const receipt=(await c.query<{r:DurableReceipt}>(
    "SELECT public.post_aqvora_customer_receipt($1,$2,$3,$4,'recovery-cash-post') r",[org,d.id,d.revision,d.fingerprint])).rows[0].r;
  await c.query("COMMIT");return receipt;
}
export async function verifyRestoredReceipt(c:Client){
  await c.query("BEGIN;SET LOCAL ROLE authenticated");await claims(c,maker);
  const receipt=(await c.query<{r:DurableReceipt}>("SELECT public.lookup_aqvora_customer_receipt_issue($1,'recovery-cash-post') r",[org])).rows[0].r;
  const replay=(await c.query<{r:DurableReceipt}>("SELECT public.post_aqvora_customer_receipt($1,$2,$3,$4,'recovery-cash-post') r",
    [org,receipt.receipt_id,receipt.source_revision,receipt.fingerprint])).rows[0].r;
  const balance=(await c.query("SELECT public.get_aqvora_invoice_open_balance($1,$2,'2026-11-20') r",[org,receipt.allocations[0].invoice_id])).rows[0].r;
  const recon=(await c.query("SELECT public.read_aqvora_receivables($1,'PKR','2026-11-20') r",[org])).rows[0].r;
  await c.query("COMMIT");return {receipt,replay,balance,recon};
}
