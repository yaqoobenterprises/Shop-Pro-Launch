import type {CurrencyBoundSource} from "./currencyContracts";
/** RPC wire types only. This module activates no client or financial writer. */
import type {ExactMinor} from "./readContracts";
export interface SalesLineInput {
  description:string;
  /** 1 whole service unit = 1,000,000. Positive canonical integer string. */
  quantity_millionths:string;
  unit_price_minor:ExactMinor;
  discount_minor:ExactMinor;
}
export interface VerifiedSalesLine extends SalesLineInput {
  line_no:number;
  gross_minor:ExactMinor;
  net_minor:ExactMinor;
}
export interface SalesCustomer {
  organization_id:string;id:string;code:string;name:string;
  is_active:boolean;revision:string;created_by:string;
}
export interface SalesIssueReceipt extends CurrencyBoundSource {
  organization_id:string;invoice_id:string;intent_key:string;
  document_number:string;journal_id:string;journal_intent_key:string;
  customer_id:string;business_date:string;currency:string;face_minor:ExactMinor;
  source_revision:string;issued_revision:string;fingerprint:string;posted_by:string;posted_at:string;
}
export interface SalesInvoice extends CurrencyBoundSource {
  organization_id:string;id:string;creation_intent:string;customer_id:string;
  business_date:string;due_date:string;currency:string;lines:VerifiedSalesLine[];
  gross_minor:ExactMinor;discount_minor:ExactMinor;face_minor:ExactMinor;
  state:"draft"|"submitted"|"approved"|"issued"|"cancelled";revision:string;
  created_by:string;approved_by:string|null;created_at:string;
  customer_snapshot:SalesCustomer|null;policy_snapshot:Record<string,unknown>|null;
  fingerprint:string|null;journal_id:string|null;document_number:string|null;cancel_reason:string|null;
  issue_receipt?:SalesIssueReceipt;
  reconciliation?:{
    source_complete:true;face_minor:ExactMinor;ar_debit_minor:ExactMinor;revenue_credit_minor:ExactMinor;
    allocated_minor:ExactMinor;outstanding_minor:ExactMinor;
    settlements_supported:true;basis:"v2_posted_receipt_allocations";
  };
}
export interface CreateSalesDraftRequest {
  p_organization_id:string;p_intent_key:string;p_customer_id:string;p_business_date:string;
  p_due_date:string;p_currency:string;p_lines:SalesLineInput[];
}
export interface EditSalesDraftRequest extends Omit<CreateSalesDraftRequest,"p_intent_key"> {
  p_invoice_id:string;p_expected_revision:string;
}
export interface SalesTransitionRequest {
  p_organization_id:string;p_invoice_id:string;p_expected_revision:string;
  p_action:"submit"|"approve"|"reject"|"cancel";p_reason?:string|null;
}
export interface SalesIssueRequest {
  p_organization_id:string;p_invoice_id:string;p_expected_revision:string;p_fingerprint:string;p_intent_key:string;
}
