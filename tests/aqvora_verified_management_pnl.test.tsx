import React from "react";
import {describe,expect,it} from "vitest";
import {render,screen} from "@testing-library/react";
import {deriveCertifiedManagementPnL} from "../src/accounting/verifiedManagementPnL";
import {CertifiedManagementPnLPanel} from "../src/components/accounting/CertifiedManagementPnLPanel";
import type {VerifiedTrialBalance} from "../src/accounting/verifiedTrialBalance";
import type {AccountClass} from "../src/accounting/types";

const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const data=[
  ["cash","1010","asset","22000","11000"],
  ["receivables","1100","asset","10000","5000"],
  ["sales","4010","revenue","1000","26000"],
  ["cogs","5010","cost_of_sales","6000","0"],
  ["expense","6010","expense","4000","0"],
  ["other-income","7010","other_income","0","2000"],
  ["other-expense","8010","other_expense","1000","0"],
] as const;

function report():VerifiedTrialBalance{
  const rows=data.map(([id,code,account_class,debit,credit],index)=>{
    const diff=BigInt(debit)-BigInt(credit);
    return {
      account:{organization_id:ORG,id,code,name:id,account_class:account_class as AccountClass,
        normal_side:account_class==="asset"||account_class==="expense"||
          account_class==="cost_of_sales"||account_class==="other_expense"?"debit":"credit",
        parent_id:null,is_active:true,is_posting:true,control_role:null,revision:"1"},
      ordinal:String(index+1),opening_minor:"0",debit_minor:debit,credit_minor:credit,
      closing_minor:diff.toString(),closing_debit_minor:(diff>0n?diff:0n).toString(),
      closing_credit_minor:(diff<0n?-diff:0n).toString(),
    };
  });
  return {
    source:{contract_version:"aqvora-read-v1",organization_id:ORG,currency:"PKR",
      from_date:"2026-11-01",to_date:"2026-11-30",snapshot_token:"f".repeat(64),
      observed_at:"2026-11-21T00:00:00Z",authorized_user_id:"owner",authorized_role:"OWNER",
      basis:"v2_posted_journals",source_complete:true,legacy_included:false,
      opening_migration_verified:false,source_journal_count:"4",source_line_count:"14",
      source_debit_minor:"44000",source_credit_minor:"44000",
      consistency:"restart_on_source_change"},
    rows,matchedCount:String(rows.length),pageCount:1,
    totals:{opening_debit_minor:"0",opening_credit_minor:"0",
      debit_minor:"44000",credit_minor:"44000",
      closing_debit_minor:"27000",closing_credit_minor:"27000"},
  } as VerifiedTrialBalance;
}

describe("AQVORA verified V2-only Management Profit & Loss",()=>{
  it("calculates period movement by account class, not lifetime balances",()=>{
    const p=deriveCertifiedManagementPnL(report());
    expect(p).toEqual({
      organizationId:ORG,currency:"PKR",fromDate:"2026-11-01",toDate:"2026-11-30",
      revenueMinor:"25000",costOfSalesMinor:"6000",grossProfitMinor:"19000",
      expensesMinor:"4000",otherIncomeMinor:"2000",otherExpensesMinor:"1000",
      netEarningsMinor:"16000",sourceToken:"f".repeat(64),
      scope:"V2_POSTED_ONLY_NOT_STATUTORY",
    });
  });

  it("renders an honest, accessible P&L from source-backed TB with no guessed money exponent",()=>{
    render(<CertifiedManagementPnLPanel report={report()} currency="PKR"/>);
    expect(screen.getByRole("region",{name:"Certified V2 management Profit and Loss"})).toBeTruthy();
    expect(screen.getByText(/2026-11-01 to 2026-11-30/)).toBeTruthy();
    expect(screen.getByText(/not an IFRS\/GAAP statutory statement/)).toBeTruthy();
    expect(screen.getAllByText("PKR 16,000 minor units").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("does not misrepresent unavailable or cross-company TB rows as zero",()=>{
    const original=report();
    expect(()=>deriveCertifiedManagementPnL({...original,source:{
      ...original.source,source_complete:false,
    }} as VerifiedTrialBalance)).toThrow(/complete.*certified/i);
    expect(()=>deriveCertifiedManagementPnL({...original,source:{
      ...original.source,legacy_included:true,
    }} as VerifiedTrialBalance)).toThrow(/complete.*certified/i);
    const wrong={...original,rows:[...original.rows]};
    wrong.rows[0]={...wrong.rows[0],account:{
      ...wrong.rows[0].account,organization_id:"foreign-company",
    }};
    expect(()=>deriveCertifiedManagementPnL(wrong)).toThrow(/foreign/i);
    const duplicated={...original,rows:[...original.rows,original.rows[0]],
      matchedCount:String(original.rows.length+1)};
    expect(()=>deriveCertifiedManagementPnL(duplicated)).toThrow(/duplicate/i);
    const partial={...original,rows:original.rows.slice(0,-1)};
    expect(()=>deriveCertifiedManagementPnL(partial)).toThrow(/complete.*certified/i);
    const mismatched={...original,totals:{...original.totals,
      debit_minor:"45000",credit_minor:"45000"}};
    expect(()=>deriveCertifiedManagementPnL(mismatched)).toThrow(/do not match/i);
  });

  it("returns legitimate zero when the authorized V2 source is truly empty",()=>{
    const s=report();
    const empty:VerifiedTrialBalance={
      ...s,rows:[],matchedCount:"0",
      totals:{opening_debit_minor:"0",opening_credit_minor:"0",
        debit_minor:"0",credit_minor:"0",closing_debit_minor:"0",
        closing_credit_minor:"0"},
      source:{...s.source,source_journal_count:"0",source_line_count:"0",
        source_debit_minor:"0",source_credit_minor:"0"},
    };
    const p=deriveCertifiedManagementPnL(empty);
    expect(p.revenueMinor).toBe("0");
    expect(p.netEarningsMinor).toBe("0");
    expect(p.organizationId).toBe(ORG);
  });
});
