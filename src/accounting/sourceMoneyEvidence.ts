/** Original-document currency evidence: never reinterpret historical entries
 * through a newer report revision or browser locale. */
import type {CurrencyUnitPolicy,CurrencyReportEvidence} from "./currencyContracts";
import {formatCertifiedReportMoney,validateCurrencyUnitPolicy} from "./currencyReportEvidence";

/** Source-bound invoice, cash or receipt values have their own immutable original
 * policy. Do not incorrectly substitute the report's current revision.
 * Malformed or future-dated policies are REFUSED, not silently rounded.
 */
export interface SourceMoneyEvidence {
  organization_id:string;
  currency:string;
  business_date:string;
  currency_policy?:CurrencyUnitPolicy|null;
  display_complete?:boolean;
}
export function formatCertifiedSourceMoney(
  minor:string, source:SourceMoneyEvidence,
):string {
  const currency=source.currency;
  if(!CURRENCY.test(currency))throw new Error("Invalid source currency.");
  const policy=source.currency_policy;
  if(source.display_complete===true&&!policy){
    throw new Error("Source claims major-unit completeness without bound currency policy.");
  }
  if(policy){
    validateCurrencyUnitPolicy(policy,{
      organizationId:source.organization_id,currency,
      asOfDate:source.business_date,
    });
  }
  if(!policy||source.display_complete===false){
    return formatCertifiedReportMoney(minor,currency,null);
  }
  return formatCertifiedReportMoney(minor,currency,{
    currency_evidence_version:"aqvora-currency-report-v1",
    currency_policy_status:"configured",display_complete:true,
    currency_policy:policy,currency_policy_revisions:[policy],
    currency_policy_timeline_fingerprint:policy.fingerprint,
  });
}

export function requireMatchingInvoicePolicyForReport(
  source:SourceMoneyEvidence, evidence:CurrencyReportEvidence|null,
):void{
  const policy=source.currency_policy;
  if(!policy)return;
  validateCurrencyUnitPolicy(policy,{organizationId:source.organization_id,
    currency:source.currency,asOfDate:source.business_date});
  if(evidence?.display_complete===true){
    const matching=evidence.currency_policy_revisions.some(p=>
      p.revision===policy.revision && p.fingerprint===policy.fingerprint &&
      p.currency_exponent===policy.currency_exponent &&
      p.minor_units_per_major===policy.minor_units_per_major);
    if(!matching)throw new Error(
      "Invoice source currency revision is not in certified report history.");
  }
}


