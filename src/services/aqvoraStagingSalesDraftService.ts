import type {
  CreateSalesDraftRequest, SalesCustomer, SalesInvoice,
} from "../accounting/salesContracts";
import { validBusinessDate } from "../accounting/minorUnits";
import { money, uuid } from "../accounting/receiptReadPrimitives";
import { getSupabaseClient } from "../lib/supabase";
import {
  isIsolatedReceivablesReadEnabled, requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";

const BIGINT_MAX = 9223372036854775807n;
const QUANTITY_SCALE = 1000000n;

/** Even in staging, financial posting is NEVER enabled by this feature. */
export function isIsolatedSalesDraftCreationEnabled(): boolean {
  return isIsolatedReceivablesReadEnabled() &&
    import.meta.env.VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS === "true";
}

async function guardedDraftRpc(
  context: IsolatedReceivablesContext,
  method: "create_aqvora_customer" | "create_aqvora_sales_draft",
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!isIsolatedSalesDraftCreationEnabled()) {
    throw new Error("Staging customer/invoice draft mutations are disabled.");
  }
  await requireIsolatedReceivablesSession(context);
  const {data,error} = await getSupabaseClient().rpc(method,args);
  if (error) throw error;
  await requireIsolatedReceivablesSession(context);
  return data;
}

function obj(value:unknown,label:string):Record<string,unknown>{
  if (!value || typeof value!=="object" || Array.isArray(value)) {
    throw new Error(`Invalid authoritative ${label} response.`);
  }
  return value as Record<string,unknown>;
}

function checkedMoney(value:unknown,label:string,positive=false):bigint{
  const n=money(value,label,true);
  if (n>BIGINT_MAX || (positive && n<=0n)) {
    throw new Error(`Invalid ${label} signed-BIGINT monetary value.`);
  }
  return n;
}

export async function createIsolatedSalesCustomer(
  context:IsolatedReceivablesContext,
  request:{code:string;name:string},
):Promise<SalesCustomer>{
  const code=request.code.trim();
  const name=request.name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(code) ||
      name.length<1 || name.length>160) {
    throw new Error("Invalid customer code or name.");
  }
  const row=obj(await guardedDraftRpc(context,"create_aqvora_customer",{
    p_organization_id:context.organizationId,p_code:code,p_name:name,
  }),"customer");
  uuid(row.id,"created customer");
  uuid(row.created_by,"customer maker");
  if (row.organization_id!==context.organizationId ||
      row.created_by!==context.userId ||
      row.code!==code || row.name!==name || row.is_active!==true ||
      checkedMoney(row.revision,"customer revision")<1n) {
    throw new Error("Created customer does not match its source/actor.");
  }
  return row as unknown as SalesCustomer;
}

export async function createIsolatedServiceInvoiceDraft(
  context:IsolatedReceivablesContext,
  request:CreateSalesDraftRequest,
):Promise<SalesInvoice>{
  if (request.p_organization_id!==context.organizationId ||
      request.p_currency!==context.currency ||
      !request.p_intent_key || request.p_intent_key.trim()!==request.p_intent_key ||
      request.p_intent_key.length>100 ||
      !validBusinessDate(request.p_business_date) ||
      !validBusinessDate(request.p_due_date) ||
      request.p_due_date<request.p_business_date ||
      !Array.isArray(request.p_lines) || request.p_lines.length<1 ||
      request.p_lines.length>100) {
    throw new Error("Invalid staged service invoice request.");
  }
  uuid(request.p_customer_id,"invoice customer");
  let total=0n;
  const expected=request.p_lines.map((line,index)=>{
    if (typeof line.description!=="string" ||
        !line.description.trim() || line.description.length>500) {
      throw new Error("Invoice line description is missing or too long.");
    }
    const quantity=checkedMoney(line.quantity_millionths,"quantity",true);
    const unit=checkedMoney(line.unit_price_minor,"unit price",true);
    const discount=checkedMoney(line.discount_minor,"line discount");
    const gross=(quantity*unit+QUANTITY_SCALE/2n)/QUANTITY_SCALE;
    if (gross<=0n || gross>BIGINT_MAX || discount>gross) {
      throw new Error("Invoice line exceeds verified amount/discount limits.");
    }
    const net=gross-discount;
    total+=net;
    if (total>BIGINT_MAX) throw new Error("Invoice total exceeds signed BIGINT.");
    return {line_no:index+1,description:line.description,quantity_millionths:line.quantity_millionths,
      unit_price_minor:line.unit_price_minor,discount_minor:line.discount_minor,
      gross_minor:gross.toString(),net_minor:net.toString()};
  });
  if (total<=0n) throw new Error("Invoice face must be positive.");

  const row=obj(await guardedDraftRpc(context,"create_aqvora_sales_draft",request),"invoice");
  uuid(row.id,"created invoice");
  if (row.organization_id!==context.organizationId ||
      row.created_by!==context.userId ||
      row.creation_intent!==request.p_intent_key ||
      row.customer_id!==request.p_customer_id ||
      row.business_date!==request.p_business_date ||
      row.due_date!==request.p_due_date ||
      row.currency!==request.p_currency ||
      !["draft","submitted","approved","issued","cancelled"].includes(String(row.state)) ||
      !Array.isArray(row.lines) || row.lines.length!==expected.length) {
    throw new Error("Saved invoice source does not match original company/draft intent.");
  }
  for(const [index,expectedLine] of expected.entries()){
    const got=obj(row.lines[index],"invoice line");
    for(const [key,value] of Object.entries(expectedLine)) {
      if(got[key]!==value)throw new Error("Server invoice line differs from requested exact draft.");
    }
  }
  if (checkedMoney(row.face_minor,"source invoice face")!==total ||
      checkedMoney(row.revision,"source revision")<1n) {
    throw new Error("Server invoice face/revision does not reconcile.");
  }
  return row as unknown as SalesInvoice;
}
