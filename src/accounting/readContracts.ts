/** Wire contracts for the certified V2 PostgreSQL readers. No UI activation. */
import type { AccountClass, AccountSide, ControlRole } from "./types";

/** Canonical signed decimal integer, arbitrary aggregate precision; never Number. */
export type ExactMinor = string;
export type ReadCursor = Record<string, string | number>;
export interface AccountingReadSource {
  contract_version: "aqvora-read-v1";
  organization_id: string;
  currency: string;
  from_date: string;
  to_date: string;
  snapshot_token: string;
  observed_at: string;
  authorized_user_id: string;
  authorized_role: "OWNER" | "MANAGER";
  basis: "v2_posted_journals";
  source_complete: true;
  legacy_included: false;
  opening_migration_verified: false;
  source_journal_count: string;
  source_line_count: string;
  source_debit_minor: ExactMinor;
  source_credit_minor: ExactMinor;
  consistency: "restart_on_source_change";
}
export interface AccountingReadAccount {
  organization_id: string;
  id: string;
  code: string;
  name: string;
  account_class: AccountClass;
  normal_side: AccountSide;
  parent_id: string | null;
  is_posting: boolean;
  is_active: boolean;
  control_role: ControlRole | null;
  revision: string;
}
export interface AccountingReadRequest {
  p_organization_id: string;
  p_from_date: string;
  p_to_date: string;
  p_currency: string;
  p_limit?: number;
  p_cursor?: ReadCursor | null;
  p_snapshot_token?: string | null;
}
export interface GeneralLedgerRequest extends AccountingReadRequest { p_account_id: string }
export interface AccountingReadPage<T> {
  source: AccountingReadSource;
  rows: T[];
  matched_count: string;
  returned_count: number;
  has_more: boolean;
  next_cursor: ReadCursor | null;
}
export interface GeneralLedgerLine {
  source_kind?: "sales_invoice" | "customer_receipt" | null;
  source_id?: string | null;
  source_revision?: string | null;
  source_fingerprint?: string | null;
  journal_id: string;
  intent_key: string;
  business_date: string;
  posted_at: string;
  posted_by: string;
  period_id: string;
  reversal_of: string | null;
  reversal_reason: string | null;
  line_no: number;
  account_id: string;
  debit_minor: ExactMinor;
  credit_minor: ExactMinor;
  party_id: string | null;
  open_item_id: string | null;
  stock_movement_id: string | null;
  audit_event_id: string;
  ordinal: string;
  running_balance_minor: ExactMinor;
}
export interface GeneralLedgerPage extends AccountingReadPage<GeneralLedgerLine> {
  account: AccountingReadAccount;
  opening_minor: ExactMinor;
  debit_minor: ExactMinor;
  credit_minor: ExactMinor;
  closing_minor: ExactMinor;
}
export interface TrialBalanceAccount {
  account: AccountingReadAccount;
  ordinal: string;
  opening_minor: ExactMinor;
  debit_minor: ExactMinor;
  credit_minor: ExactMinor;
  closing_minor: ExactMinor;
  closing_debit_minor: ExactMinor;
  closing_credit_minor: ExactMinor;
}
export interface TrialBalancePage extends AccountingReadPage<TrialBalanceAccount> {
  totals: {
    opening_debit_minor: ExactMinor;
    opening_credit_minor: ExactMinor;
    debit_minor: ExactMinor;
    credit_minor: ExactMinor;
    closing_debit_minor: ExactMinor;
    closing_credit_minor: ExactMinor;
  };
}
