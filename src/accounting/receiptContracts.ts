/** PostgreSQL RPC wire contracts only. Activates no financial writer or client. */
import type {AccountingReadSource,ExactMinor} from "./readContracts";
export interface ReceiptAllocationInput {invoice_id:string;amount_minor:ExactMinor}
export interface VerifiedReceiptAllocation extends ReceiptAllocationInput {invoice_revision:string;invoice_fingerprint:string}
export interface ReceiptAllocationReference extends ReceiptAllocationInput {allocation_id:string;journal_id:string;line_no:number}
export interface CashCollection {
  organization_id:string;id:string;creation_intent:string;collection_number:string;
  source_kind:"controlled_cash";customer_id:string;business_date:string;currency:string;amount_minor:ExactMinor;
  state:"draft"|"confirmed"|"cancelled";revision:string;created_by:string;confirmed_by:string|null;
  maker_session_fingerprint:string;checker_session_fingerprint:string|null;
  customer_snapshot:Record<string,unknown>|null;policy_snapshot:Record<string,unknown>|null;
  fingerprint:string|null;created_at:string;confirmed_at:string|null;cancel_reason:string|null;
  evidence_method:"unconfirmed_claim"|"dual_control_cash_attestation";posted_receipt_id?:string|null;
}
export interface CustomerReceiptIssue {
  organization_id:string;receipt_id:string;collection_id:string;source_ref:string;receipt_number:string;intent_key:string;
  journal_id:string;journal_intent_key:string;customer_id:string;business_date:string;currency:string;amount_minor:ExactMinor;
  source_revision:string;posted_revision:string;fingerprint:string;posted_by:string;posted_at:string;
  allocations:ReceiptAllocationReference[];evidence_method:"dual_control_cash_attestation";
}
export interface CustomerReceipt {
  organization_id:string;id:string;creation_intent:string;collection_id:string;collection_fingerprint:string;
  customer_id:string;business_date:string;currency:string;amount_minor:ExactMinor;allocations:VerifiedReceiptAllocation[];
  state:"draft"|"submitted"|"approved"|"posted"|"cancelled";revision:string;created_by:string;approved_by:string|null;
  policy_snapshot:Record<string,unknown>|null;fingerprint:string|null;journal_id:string|null;receipt_number:string|null;cancel_reason:string|null;
  issue_receipt?:CustomerReceiptIssue;
  reconciliation?:{source_complete:true;cash_debit_minor:ExactMinor;ar_credit_minor:ExactMinor;allocated_minor:ExactMinor;
    bank_verified:false;evidence_method:"dual_control_cash_attestation"};
}
export interface InvoiceOpenAllocationReference extends Omit<ReceiptAllocationReference,"invoice_id"> {
  receipt_id:string;collection_id:string;receipt_number:string;business_date:string;
}
export interface InvoiceOpenBalance {
  organization_id:string;invoice_id:string;customer_id:string;currency:string;business_date:string;due_date:string;as_of_date:string|null;
  face_minor:ExactMinor;allocated_minor:ExactMinor;outstanding_minor:ExactMinor;all_posted_allocated_minor:ExactMinor;
  status:"unpaid"|"partial"|"settled";allocations:InvoiceOpenAllocationReference[];
  source_complete:true;scope:"v2_invoice_allocations";fingerprint:string;legacy_included:false;opening_migration_verified:false;
}
export interface OpenInvoicePage {
  source:AccountingReadSource;rows:InvoiceOpenBalance[];matched_count:string;has_more:boolean;next_after_id:string|null;
}
export interface ReceivablesReconciliation {
  source:AccountingReadSource;customer_id:string|null;as_of_date:string;invoice_count:string;
  face_minor:ExactMinor;allocated_minor:ExactMinor;outstanding_minor:ExactMinor;ar_control_minor:ExactMinor;
  scope:"company"|"customer";aging_supported:false;
}
export interface CreateCashCollectionRequest {
  p_organization_id:string;p_intent_key:string;p_customer_id:string;p_business_date:string;p_currency:string;
  p_amount_minor:ExactMinor;p_source_kind:"controlled_cash";
}
export interface ConfirmCashCollectionRequest {
  p_organization_id:string;p_collection_id:string;p_expected_revision:string;p_counted_minor:ExactMinor;p_attestation:"cash_counted_in_person";
}
export interface CreateCustomerReceiptRequest {
  p_organization_id:string;p_intent_key:string;p_collection_id:string;p_allocations:ReceiptAllocationInput[];
}
export interface EditCustomerReceiptRequest extends Pick<CreateCustomerReceiptRequest,"p_organization_id"|"p_allocations"> {
  p_receipt_id:string;p_expected_revision:string;
}
export interface ReceiptTransitionRequest {
  p_organization_id:string;p_receipt_id:string;p_expected_revision:string;p_action:"submit"|"approve"|"reject"|"cancel";p_reason?:string|null;
}
export interface PostCustomerReceiptRequest {
  p_organization_id:string;p_receipt_id:string;p_expected_revision:string;p_fingerprint:string;p_intent_key:string;
}
