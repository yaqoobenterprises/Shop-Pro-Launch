/** Strict defense-in-depth for Codex #78 currency evidence on authorized V2 reports.
 * Only database-sourced policy and COMPLETE report envelopes may format major units.
 * Fingerprints are checked for shape and consistency, not re-signed in the browser.
 */
import type {CurrencyReportEvidence,CurrencyUnitPolicy} from "./currencyContracts";
import {exactReadMinor,readRecord,readString} from "./verifiedReadValidation";

const SHA=/^[0-9a-f]{64}$/;
const CURRENCY=/^[A-Z]{3}$/;
const CANONICAL=/^[1-9][0-9]*$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const EVIDENCE_KEYS=[
  "currency_evidence_version","currency_policy_status","display_complete",
  "currency_policy","currency_policy_revisions",
  "currency_policy_timeline_fingerprint",
] as const;

export interface CurrencyEvidenceScope {
  organizationId:string;
  currency:string;
  asOfDate:string;
}
function date(value:unknown,name:string):string{
  if(typeof value!=="string"||!DATE.test(value)||
     !Number.isFinite(Date.parse(value+"T00:00:00Z"))||
     new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value){
    throw new Error("Invalid "+name+" date in certified currency evidence.");
  }
  return value;
}
function positive(value:unknown,name:string):string {
  if(typeof value!=="string"||!CANONICAL.test(value)){
    throw new Error("Invalid "+name+" in certified currency evidence.");
  }
  return value;
}
function fingerprint(value:unknown,name:string):string{
  if(typeof value!=="string"||!SHA.test(value)){
    throw new Error("Invalid "+name+" in certified currency evidence.");
  }
  return value;
}
function required(value:unknown,name:string):string{
  const text=readString(value,name);
  if(text.length>1024||text!==text.trim()){
    throw new Error("Invalid "+name+" in certified currency evidence.");
  }
  return text;
}

/** Validate one policy independently of any browser locale, Number money or Intl scale. */
export function validateCurrencyUnitPolicy(
  raw:unknown,scope:CurrencyEvidenceScope,
):CurrencyUnitPolicy{
  const p=readRecord(raw,"currency policy");
  if(p.contract_version!=="aqvora-currency-policy-v1"||
     p.status!=="configured"||
     p.organization_id!==scope.organizationId||
     p.transaction_currency!==scope.currency||
     p.ledger_currency!==scope.currency||p.fx_supported!==false||
     p.source_rounding!=="quantity_millionths_half_up_per_line_v1"){
    throw new Error("Currency policy company, currency or contract is incompatible.");
  }
  const exponent=p.currency_exponent;
  if(typeof exponent!=="number"||!Number.isSafeInteger(exponent)||
     exponent<0||exponent>9||p.display_decimal_places!==exponent||
     p.minor_units_per_major!==(10n**BigInt(exponent)).toString()){
    throw new Error("Currency policy exponent or exact denominator is inconsistent.");
  }
  positive(p.revision,"policy revision");
  fingerprint(p.fingerprint,"policy fingerprint");
  if(date(p.effective_from,"policy effective")>date(scope.asOfDate,"as-of")){
    throw new Error("A future currency policy cannot interpret prior financial amounts.");
  }
  const provenance=readRecord(p.provenance,"currency authority provenance");
  if(provenance.kind!=="trusted_company_accounting_policy"){
    throw new Error("Currency policy is missing trusted company authority.");
  }
  for(const key of ["authority_reference","authority_revision","approval_reference"]){
    required(provenance[key],key);
  }
  required(provenance.approved_by,"currency approving actor");
  return p as unknown as CurrencyUnitPolicy;
}

/** Older server versions have NO currency evidence: display RAW minor units only.
 * A partially upgraded or forged evidence envelope is a hard read failure.
 */
export function validateReportCurrencyEvidence(
  raw:unknown,scope:CurrencyEvidenceScope,
  first?:CurrencyReportEvidence|null,
):CurrencyReportEvidence|null {
  const source=readRecord(raw,"report currency evidence");
  const present=EVIDENCE_KEYS.filter(key=>Object.prototype.hasOwnProperty.call(source,key));
  if(present.length===0){
    if(first)throw new Error("Report currency evidence disappeared across pages.");
    return null;
  }
  if(present.length!==EVIDENCE_KEYS.length){
    throw new Error("Incomplete report currency evidence; financial read refused.");
  }
  if(source.currency_evidence_version!=="aqvora-currency-report-v1"||
     (source.currency_policy_status!=="configured"&&
      source.currency_policy_status!=="unconfigured")||
     typeof source.display_complete!=="boolean"){
    throw new Error("Unsupported report currency evidence contract.");
  }
  fingerprint(source.currency_policy_timeline_fingerprint,
    "policy timeline fingerprint");
  if(!Array.isArray(source.currency_policy_revisions)||
     source.currency_policy_revisions.length>100){
    throw new Error("Invalid currency policy revision timeline.");
  }
  let lastRevision=0n,lastDate="";
  const revisions:CurrencyUnitPolicy[]=[];
  for(const item of source.currency_policy_revisions){
    const p=validateCurrencyUnitPolicy(item,scope);
    const revision=BigInt(p.revision);
    if(revision<=lastRevision||p.effective_from<=lastDate){
      throw new Error("Unordered or duplicated currency policy revisions.");
    }
    lastRevision=revision;lastDate=p.effective_from;
    revisions.push(p);
  }
  const configured=source.currency_policy_status==="configured";
  if(!configured){
    if(source.display_complete!==false||source.currency_policy!==null||
       revisions.length!==0){
      throw new Error("Unconfigured currency policy may not certify major-unit display.");
    }
  }else{
    const current=validateCurrencyUnitPolicy(source.currency_policy,scope);
    const latest=revisions.at(-1);
    if(!latest||JSON.stringify(current)!==JSON.stringify(latest)){
      throw new Error("Current currency policy disagrees with certified revision timeline.");
    }
    if(revisions.some(p=>p.currency_exponent!==current.currency_exponent||
         p.minor_units_per_major!==current.minor_units_per_major)){
      throw new Error("Currency report contains incompatible historical unit scales.");
    }
  }
  const normalized=source as unknown as CurrencyReportEvidence;
  if(first && JSON.stringify(normalized)!==JSON.stringify(first)){
    throw new Error("Report currency authority changed across paginated source.");
  }
  return normalized;
}

const group=(digits:string):string=>digits.replace(/\B(?=(\d{3})+(?!\d))/g,",");

/** Never claim major units without a complete, validated source-owned policy.
 * Supports arbitrary NUMERIC aggregates and signed GL balances exactly.
 */
export function formatCertifiedReportMoney(
  minor:string,currency:string,evidence:CurrencyReportEvidence|null|undefined,
):string{
  if(!CURRENCY.test(currency)){
    throw new Error("Invalid certified report currency.");
  }
  const amount=exactReadMinor(minor,"financial display amount");
  const sign=amount<0n?"-":"";
  const magnitude=amount<0n?-amount:amount;
  if(!evidence||evidence.display_complete!==true||
     evidence.currency_policy_status!=="configured"||!evidence.currency_policy){
    return `${currency} ${sign}${group(magnitude.toString())} minor units`;
  }
  const p=evidence.currency_policy;
  const exponent=p.currency_exponent;
  if(!Number.isSafeInteger(exponent)||exponent<0||exponent>9||
     p.display_decimal_places!==exponent||
     p.transaction_currency!==currency||p.ledger_currency!==currency||
     p.minor_units_per_major!==(10n**BigInt(exponent)).toString()){
    throw new Error("Currency policy is not safe for exact display.");
  }
  const denominator=BigInt(p.minor_units_per_major);
  const major=group((magnitude/denominator).toString());
  const fraction=(magnitude%denominator).toString().padStart(exponent,"0");
  return `${currency} ${sign}${major}${exponent===0?"":"."+fraction}`;
}
