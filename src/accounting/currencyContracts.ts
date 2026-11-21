/** Server wire contract. Trust only authenticated RPC responses scoped to the
 * requested company/date; a browser-supplied object is never policy authority. */
export interface CurrencyUnitPolicy {
  contract_version: "aqvora-currency-policy-v1";
  status: "configured";
  organization_id: string;
  transaction_currency: string;
  ledger_currency: string;
  currency_exponent: number;
  minor_units_per_major: string;
  display_decimal_places: number;
  revision: string;
  effective_from: string;
  fingerprint: string;
  provenance: {
    kind: "trusted_company_accounting_policy";
    authority_reference: string;
    authority_revision: string;
    approval_reference: string;
    approved_by: string;
  };
  source_rounding: "quantity_millionths_half_up_per_line_v1";
  fx_supported: false;
}
export interface CurrencyPolicyRequest {
  p_organization_id: string;
  p_currency: string;
  p_as_of_date: string;
}
interface CurrencyPolicyReadScope {
  contract_version: "aqvora-currency-read-v1";
  organization_id: string;
  transaction_currency: string;
  ledger_currency: string;
  as_of_date: string;
}
export type CurrencyPolicyRead = CurrencyPolicyReadScope & (
  | {status: "configured"; display_complete: true; policy: CurrencyUnitPolicy}
  | {status: "unconfigured"; display_complete: false; policy: null}
);
/** Additive evidence on certified AR/GL/TB envelopes. Old servers omit it;
 * absent/false evidence always means raw minor-unit display only. */
export interface CurrencyReportEvidence {
  currency_evidence_version: "aqvora-currency-report-v1";
  currency_policy_status: "configured" | "unconfigured";
  display_complete: boolean;
  currency_policy: CurrencyUnitPolicy | null;
  currency_policy_revisions: CurrencyUnitPolicy[];
  currency_policy_timeline_fingerprint: string;
}
export interface CurrencyBoundSource {
  /** Absent only for pre-policy history; never infer a historical scale. */
  currency_policy?: CurrencyUnitPolicy;
}
