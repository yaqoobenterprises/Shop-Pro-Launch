import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { readFixtureSql,readIds as i } from "./aqvoraReadFixture";
export { readIds } from "./aqvoraReadFixture";
export const ar = "88888888-8888-4888-8888-888888888888";
export const salesMigrations = [
  "20261120161947_aqvora_sales_source_schema.sql","20261120162112_aqvora_sales_validation.sql",
  "20261120162115_aqvora_customer_api.sql","20261120162118_aqvora_sales_draft_api.sql",
  "20261120162121_aqvora_sales_lifecycle.sql","20261120162125_aqvora_sales_issue.sql",
  "20261120162130_aqvora_sales_certification.sql","20261120162134_aqvora_sales_reads.sql",
];
export const salesMigrationSql = () => salesMigrations.map((file) =>
  readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),"utf8")).join("\n");
export const salesSeedSql = (org=i.org,owner=i.owner,revenue=i.sales) => `
  INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting,control_role)
    VALUES ('${org}','${ar}','1100','Trade receivables','asset','debit',true,'receivable');
  INSERT INTO private.aqvora_sales_policies
    (organization_id,revision,is_active,currency,jurisdiction,tax_treatment,evidence,approved_by,
     starts_on,ends_on,ar_account_id,revenue_account_id)
    VALUES ('${org}',1,true,'PKR','TEST-ONLY','verified_out_of_scope','Synthetic fixture, never jurisdiction advice',
      '${owner}','2026-01-01','2026-12-31','${ar}','${revenue}');
`;
export const salesFixtureSql = () => readFixtureSql()+salesMigrationSql()+salesSeedSql();
export const serviceLines = [{ description:"Consulting",quantity_millionths:"1000000",unit_price_minor:"101",discount_minor:"0" }];
export interface SalesDocument {
  id:string; organization_id:string; customer_id:string; state:string; revision:string;
  fingerprint:string|null; face_minor:string; gross_minor:string; discount_minor:string;
  journal_id:string|null; document_number:string|null; lines:Array<Record<string,string|number>>;
  reconciliation?:{ face_minor:string; ar_debit_minor:string; revenue_credit_minor:string };
}
export interface SalesReceipt { invoice_id:string; journal_id:string; face_minor:string; document_number:string; source_revision:string }
export function salesHarness() {
  const db=new PGlite(); let serial=0;
  const query=async <T>(sql:string,params:unknown[]=[]) => {
    await db.exec("SAVEPOINT sales_case");
    try { const r=await db.query<T>(sql,params); await db.exec("RELEASE SAVEPOINT sales_case"); return r; }
    catch(error) { await db.exec("ROLLBACK TO SAVEPOINT sales_case; RELEASE SAVEPOINT sales_case"); throw error; }
  };
  const user=async(actor=i.manager,aal="aal2") => {
    await db.exec("RESET ROLE");
    await query(`SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),
      set_config('request.jwt.claim.session_id',$1,false)`,[actor,aal]);
    await db.exec("SET ROLE authenticated");
  };
  const key=()=>`sales-test-${++serial}`;
  const customer=async(org=i.org) => (await query<{r:{id:string}}>(
    "SELECT public.create_aqvora_customer($1,$2,'Synthetic customer') r",[org,key()])).rows[0].r.id;
  const draft=async(customerId:string,lines:unknown=serviceLines,intent=key(),org=i.org) =>
    (await query<{r:SalesDocument}>("SELECT public.create_aqvora_sales_draft($1,$2,$3,'2026-11-20','2026-12-20','PKR',$4::jsonb) r",
      [org,intent,customerId,JSON.stringify(lines)])).rows[0].r;
  const transition=async(d:SalesDocument,action:string,reason:string|null=null) =>
    (await query<{r:SalesDocument}>("SELECT public.transition_aqvora_sales_invoice($1,$2,$3,$4,$5) r",
      [i.org,d.id,d.revision,action,reason])).rows[0].r;
  const approve=async(d:SalesDocument) => {
    const submitted=await transition(d,"submit"); await user(i.owner);
    const approved=await transition(submitted,"approve"); await user(); return approved;
  };
  const issue=async(d:SalesDocument,intent=key(),fingerprint=d.fingerprint) =>
    (await query<{r:SalesReceipt}>("SELECT public.issue_aqvora_sales_invoice($1,$2,$3,$4,$5) r",
      [i.org,d.id,d.revision,fingerprint,intent])).rows[0].r;
  const get=async(id:string,org=i.org) => (await query<{r:SalesDocument}>(
    "SELECT public.get_aqvora_sales_invoice($1,$2) r",[org,id])).rows[0].r;
  return {db,query,user,key,customer,draft,transition,approve,issue,get};
}
