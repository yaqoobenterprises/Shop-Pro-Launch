import {readFileSync} from "node:fs";
import {salesFixtureSql,salesHarness,readIds as i,ar,serviceLines,type SalesDocument} from "./aqvoraSalesFixture";
export {readIds,ar,serviceLines} from "./aqvoraSalesFixture";
export const receiptCash="12121212-1212-4212-8212-121212121212";
export const receiptMigrations=[
  "20261120172141_aqvora_receipt_schema.sql","20261120172144_aqvora_receipt_primitives.sql",
  "20261120172146_aqvora_cash_collections.sql","20261120172149_aqvora_receipt_drafts.sql",
  "20261120172152_aqvora_receipt_posting.sql","20261120172155_aqvora_receipt_certification.sql",
  "20261120172158_aqvora_receipt_balances.sql","20261120172200_aqvora_receipt_reads.sql",
];
export const receiptMigrationSql=()=>receiptMigrations.map(f=>readFileSync(new URL(`../../supabase/migrations/${f}`,import.meta.url),"utf8")).join("\n");
export const receiptSeedSql=(org=i.org,owner=i.owner)=>`
  INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting,control_role)
    VALUES('${org}','${receiptCash}','1010','Controlled till','asset','debit',true,'cash');
  INSERT INTO private.aqvora_receipt_policies(organization_id,revision,is_active,source_kind,currency,cash_account_id,ar_account_id,
    starts_on,ends_on,evidence,approved_by) VALUES('${org}',1,true,'controlled_cash','PKR','${receiptCash}','${ar}',
    '2026-01-01','2026-12-31','TEST ONLY: dual-control cash attestation','${owner}');
`;
export const receiptFixtureSql=()=>salesFixtureSql()+"ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';\n"+receiptMigrationSql()+receiptSeedSql();
export interface CashDoc {id:string;revision:string;state:string;fingerprint:string|null;amount_minor:string;collection_number:string;customer_id:string}
export interface ReceiptDoc {id:string;revision:string;state:string;fingerprint:string|null;amount_minor:string;collection_id:string;
  allocations:Array<Record<string,string>>;reconciliation?:{cash_debit_minor:string;ar_credit_minor:string;allocated_minor:string}}
export interface ReceiptIssue {receipt_id:string;journal_id:string;amount_minor:string;receipt_number:string;source_ref:string;
  allocations:Array<{allocation_id:string;invoice_id:string;amount_minor:string;line_no:number}>}
export interface OpenBalance {face_minor:string;allocated_minor:string;outstanding_minor:string;status:string;allocations:unknown[]}
export function receiptHarness(){
  const h=salesHarness();
  const invoice=async(customer:string,amount="101",date="2026-11-18")=>{
    const d=(await h.query<{r:SalesDocument}>("SELECT public.create_aqvora_sales_draft($1,$2,$3,$4,'2026-12-20','PKR',$5::jsonb) r",
      [i.org,h.key(),customer,date,JSON.stringify([{...serviceLines[0],unit_price_minor:amount}])])).rows[0].r;
    const approved=await h.approve(d);await h.issue(approved);return h.get(d.id);
  };
  const cash=async(customer:string,amount:unknown="101",date="2026-11-20",key=h.key(),kind="controlled_cash")=>
    (await h.query<{r:CashDoc}>("SELECT public.create_aqvora_cash_collection($1,$2,$3,$4,'PKR',$5::jsonb,$6) r",
      [i.org,key,customer,date,JSON.stringify(amount),kind])).rows[0].r;
  const confirm=async(c:CashDoc)=>{await h.user(i.owner);
    const r=(await h.query<{r:CashDoc}>("SELECT public.confirm_aqvora_cash_collection($1,$2,$3,$4::jsonb,'cash_counted_in_person') r",
      [i.org,c.id,c.revision,JSON.stringify(c.amount_minor)])).rows[0].r;await h.user();return r;};
  const draftReceipt=async(c:CashDoc,allocations:unknown,key=h.key())=>(await h.query<{r:ReceiptDoc}>(
    "SELECT public.create_aqvora_customer_receipt_draft($1,$2,$3,$4::jsonb) r",[i.org,key,c.id,JSON.stringify(allocations)])).rows[0].r;
  const receiptTransition=async(r:ReceiptDoc,action:string,reason:string|null=null)=>(await h.query<{r:ReceiptDoc}>(
    "SELECT public.transition_aqvora_customer_receipt($1,$2,$3,$4,$5) r",[i.org,r.id,r.revision,action,reason])).rows[0].r;
  const approveReceipt=async(r:ReceiptDoc)=>{const submitted=await receiptTransition(r,"submit");await h.user(i.owner);
    const approved=await receiptTransition(submitted,"approve");await h.user();return approved;};
  const postReceipt=async(r:ReceiptDoc,key=h.key(),fp=r.fingerprint)=>(await h.query<{r:ReceiptIssue}>(
    "SELECT public.post_aqvora_customer_receipt($1,$2,$3,$4,$5) r",[i.org,r.id,r.revision,fp,key])).rows[0].r;
  const openBalance=async(id:string,date="2026-11-20")=>(await h.query<{r:OpenBalance}>(
    "SELECT public.get_aqvora_invoice_open_balance($1,$2,$3) r",[i.org,id,date])).rows[0].r;
  return {...h,invoice,cash,confirm,draftReceipt,receiptTransition,approveReceipt,postReceipt,openBalance};
}
