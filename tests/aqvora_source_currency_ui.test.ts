import {describe,expect,it} from "vitest";
import type {CurrencyUnitPolicy} from "../src/accounting/currencyContracts";
import {
  formatCertifiedReportMoney,formatCertifiedSourceMoney,
  requireMatchingInvoicePolicyForReport,validateCurrencyUnitPolicy,
  validateReportCurrencyEvidence,
} from "../src/accounting/currencyReportEvidence";
import {validateCertifiedSource} from "../src/accounting/verifiedReadValidation";

const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const sha="a".repeat(64);
const scope={organizationId:org,currency:"PKR",asOfDate:"2026-11-21"};

function policy(currency="PKR",exponent=2,revision="1",from="2026-01-01"){
  const p:CurrencyUnitPolicy={
    contract_version:"aqvora-currency-policy-v1",status:"configured",
    organization_id:org,transaction_currency:currency,ledger_currency:currency,
    currency_exponent:exponent,minor_units_per_major:(10n**BigInt(exponent)).toString(),
    display_decimal_places:exponent,revision,effective_from:from,
    fingerprint:sha,source_rounding:"quantity_millionths_half_up_per_line_v1",
    provenance:{kind:"trusted_company_accounting_policy",
      authority_reference:"sample-authority",authority_revision:"2026",
      approval_reference:"approved-synthetic-fixture",approved_by:actor},
    fx_supported:false,
  };
  return p;
}
function evidence(p:CurrencyUnitPolicy=policy(),complete=true){
  return {
    currency_evidence_version:"aqvora-currency-report-v1" as const,
    currency_policy_status:"configured" as const,
    display_complete:complete,currency_policy:p,
    currency_policy_revisions:[p],
    currency_policy_timeline_fingerprint:sha,
  };
}
function source(extra:Record<string,unknown>={}){
  return {
    contract_version:"aqvora-read-v1",basis:"v2_posted_journals",
    organization_id:org,currency:"PKR",from_date:"2026-11-01",
    to_date:"2026-11-21",snapshot_token:sha,observed_at:"2026-11-21T10:00:00Z",
    authorized_user_id:actor,authorized_role:"OWNER",
    source_complete:true,legacy_included:false,opening_migration_verified:false,
    consistency:"restart_on_source_change",source_journal_count:"0",
    source_line_count:"0",source_debit_minor:"0",source_credit_minor:"0",
    ...extra,
  };
}
const readContext={
  organizationId:org,currency:"PKR",fromDate:"2026-11-01",toDate:"2026-11-21",
};
describe("Source-certified company currency interpretation (#78)",()=>{
  it.each([
    ["PKR",2,"100","123456","PKR 1,234.56"],
    ["USD",2,"100","123456","USD 1,234.56"],
    ["JPY",0,"1","123456","JPY 123,456"],
    ["KWD",3,"1000","123456","KWD 123.456"],
    ["CLF",4,"10000","123456","CLF 12.3456"],
  ])("uses certified %s exponent %s without Intl guessing",
    (currency,exp,denominator,minor,formatted)=>{
    const ctx={...scope,currency};
    const p=policy(currency,exp);
    expect(p.minor_units_per_major).toBe(denominator);
    const validated=validateReportCurrencyEvidence(evidence(p),ctx);
    expect(formatCertifiedReportMoney(minor,currency,validated)).toBe(formatted);
    expect(validateCurrencyUnitPolicy(p,ctx)).toEqual(p);
  });
  it("formats signed, zero and NUMERIC aggregates with BigInt not floating math",()=>{
    const e=validateReportCurrencyEvidence(evidence(),scope);
    expect(formatCertifiedReportMoney("-123456","PKR",e)).toBe("PKR -1,234.56");
    expect(formatCertifiedReportMoney("0","PKR",e)).toBe("PKR 0.00");
    expect(formatCertifiedReportMoney("9223372036854775807","PKR",e))
      .toBe("PKR 92,233,720,368,547,758.07");
    expect(formatCertifiedReportMoney("18446744073709551614","PKR",e))
      .toBe("PKR 184,467,440,737,095,516.14");
  });
  it("never invents a historical amount scale if policy absent or incomplete",()=>{
    expect(validateReportCurrencyEvidence({},scope)).toBeNull();
    const notConfigured={
      ...evidence(),currency_policy_status:"unconfigured",display_complete:false,
      currency_policy:null,currency_policy_revisions:[],
    };
    const verified=validateReportCurrencyEvidence(notConfigured,scope);
    expect(verified?.display_complete).toBe(false);
    expect(formatCertifiedReportMoney("150","PKR",verified))
      .toBe("PKR 150 minor units");
    expect(formatCertifiedReportMoney("-150","PKR",null))
      .toBe("PKR -150 minor units");
    const partial=validateReportCurrencyEvidence(evidence(policy(),false),scope);
    expect(formatCertifiedReportMoney("150","PKR",partial))
      .toBe("PKR 150 minor units");
  });
  it("rejects forged exponent/denominator, FX and mismatched company or currency",()=>{
    const p=policy();
    for(const bad of [
      {...p,currency_exponent:0},{...p,minor_units_per_major:"1000"},
      {...p,display_decimal_places:3},{...p,organization_id:actor},
      {...p,transaction_currency:"JPY"},{...p,ledger_currency:"USD"},
      {...p,fx_supported:true},{...p,fingerprint:"bad"},
      {...p,effective_from:"2026-12-01"},
      {...p,provenance:{...p.provenance,approval_reference:""}},
    ]){
      expect(()=>validateReportCurrencyEvidence(evidence(bad as CurrencyUnitPolicy),scope))
        .toThrow();
    }
  });
  it("rejects incomplete or contradictory source evidence",()=>{
    const p=policy();
    for(const bad of [
      {currency_policy_status:"configured"},
      {...evidence(),currency_policy_timeline_fingerprint:"bad"},
      {...evidence(),currency_policy_revisions:[p,p]},
      {...evidence(),currency_policy_revisions:[{...p,revision:"2"},p]},
      {...evidence(),currency_policy_revisions:[p,{...p,revision:"2",
        effective_from:"2026-02-01",currency_exponent:3,minor_units_per_major:"1000",
        display_decimal_places:3}],
        currency_policy:{...p,revision:"2",effective_from:"2026-02-01"}},
      {...evidence(),currency_policy_status:"unconfigured"},
      {...evidence(),currency_policy:null},
      {...evidence(),currency_policy_revisions:[]},
    ]){
      expect(()=>validateReportCurrencyEvidence(bad,scope)).toThrow();
    }
  });
  it("allows legitimate revision timeline only with unchanged unit scale",()=>{
    const first=policy(),later=policy("PKR",2,"2","2026-11-15");
    const result=validateReportCurrencyEvidence({...evidence(later),
      currency_policy_revisions:[first,later]},scope);
    expect(result?.currency_policy_revisions).toHaveLength(2);
    expect(formatCertifiedReportMoney("101","PKR",result)).toBe("PKR 1.01");
  });
  it("rejects changed/vanished/appearing policy between ledger pages",()=>{
    const old=validateCertifiedSource(source(),readContext);
    const verified=validateCertifiedSource(source(evidence()),readContext);
    expect(()=>validateCertifiedSource(source(evidence()),readContext,old))
      .toThrow(/currency/i);
    expect(()=>validateCertifiedSource(source(),readContext,verified))
      .toThrow(/currency/i);
    expect(()=>validateCertifiedSource(source({...evidence(),
      currency_policy_timeline_fingerprint:"b".repeat(64)}),readContext,verified))
      .toThrow(/currency/i);
    expect(validateCertifiedSource(source(evidence()),readContext,verified))
      .toMatchObject({currency_evidence_version:"aqvora-currency-report-v1"});
  });
  it("formats invoice/receipt from ORIGINAL revision not latest report date",()=>{
    const original=policy("PKR",2,"1","2026-01-01");
    const newer=policy("PKR",2,"2","2026-11-15");
    const source={organization_id:org,currency:"PKR",
      business_date:"2026-11-14",currency_policy:original,display_complete:true};
    const current=validateReportCurrencyEvidence({...evidence(newer),
      currency_policy_revisions:[original,newer]},scope);
    expect(formatCertifiedSourceMoney("150",source)).toBe("PKR 1.50");
    expect(()=>requireMatchingInvoicePolicyForReport(source,current)).not.toThrow();
    expect(formatCertifiedSourceMoney("60",{...source,display_complete:false}))
      .toBe("PKR 60 minor units");
    expect(formatCertifiedSourceMoney("60",{...source,currency_policy:null,display_complete:false}))
      .toBe("PKR 60 minor units");
    expect(()=>formatCertifiedSourceMoney("150",{
      ...source,currency_policy:null,display_complete:true,
    })).toThrow(/completeness/);
  });
  it("refuses foreign, missing-from-timeline or future-dated source policies",()=>{
    const original=policy();
    const report=validateReportCurrencyEvidence(evidence(),scope);
    for(const invalid of [
      {...original,organization_id:actor},
      {...original,transaction_currency:"JPY"},
      {...original,minor_units_per_major:"1"},
      {...original,effective_from:"2026-12-01"},
    ]){
      const row={organization_id:org,currency:"PKR",
        business_date:"2026-11-14",currency_policy:invalid};
      expect(()=>formatCertifiedSourceMoney("150",row)).toThrow();
    }
    const alien={organization_id:org,currency:"PKR",
      business_date:"2026-11-14",
      currency_policy:{...original,fingerprint:"b".repeat(64)}};
    expect(()=>requireMatchingInvoicePolicyForReport(alien,report)).toThrow(/not in certified/);
  });
  it("never converts malformed money or uses floating numeric guesses",()=>{
    const valid=validateReportCurrencyEvidence(evidence(),scope);
    for(const v of ["01","-0","1.5","1e3","NaN",String(1.5)," 100"]){
      expect(()=>formatCertifiedReportMoney(v,"PKR",valid)).toThrow();
    }
    expect(()=>formatCertifiedReportMoney("150","pkr",valid)).toThrow();
    expect(()=>formatCertifiedReportMoney("150","PKR",{
      ...evidence(),currency_policy:{...policy(),minor_units_per_major:"1"},
    })).toThrow();
  });
});
