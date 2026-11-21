import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot } from "../src/accounting/financialSnapshot";
import { previewJournalDraft } from "../src/accounting/journalPreview";
import type { ChartAccount, PostedJournal } from "../src/accounting/types";

const ORG="fresh-finance-fixture";
const CURRENCY="PKR";
const DATE="2026-11-20";
const definitions=[
  ["bank","1010","asset","debit"],
  ["ar","1100","asset","debit"],
  ["inventory","1200","asset","debit"],
  ["ap","2010","liability","credit"],
  ["wages-pay","2020","liability","credit"],
  ["capital","3010","equity","credit"],
  ["drawings","3020","equity","debit"],
  ["sales","4010","revenue","credit"],
  ["cogs","5010","cost_of_sales","debit"],
  ["payroll","6010","expense","debit"],
] as const;
const accounts:ChartAccount[]=definitions.map(([id,code,accountClass,normalSide])=>({
  id,code,accountClass,normalSide,name:id,organizationId:ORG,
  parentId:null,isPosting:true,isActive:true,
}));
const money=(major:number)=>String(major*100);
const movements=[
  ["buy-inventory-on-credit","inventory","ap",180],
  ["sell-on-credit","ar","sales",200],
  ["recognize-sold-inventory-cost","cogs","inventory",120],
  ["collect-customer-receivable","bank","ar",80],
  ["pay-supplier-partial","ap","bank",60],
  ["owner-invests-cash","bank","capital",1000],
  ["owner-draws-cash","drawings","bank",200],
  ["accrue-unpaid-salary","payroll","wages-pay",30],
] as const;

function posted(index:number, deb:string, cred:string, amount:string, date=DATE):PostedJournal {
  return {id:"journal-"+index,organizationId:ORG,intentId:"intent-"+index,
    currency:CURRENCY,businessDate:date,status:"posted",lines:[
      {lineId:"dr-"+index,accountId:deb,debitMinor:amount,creditMinor:"0"},
      {lineId:"cr-"+index,accountId:cred,debitMinor:"0",creditMinor:amount},
    ],
  };
}
const entries:PostedJournal[]=movements.map(([name,dr,cr,value],i)=>
  ({...posted(i,dr,cr,money(value)),intentId:name}));

describe("AQVORA full accrual accounting rule matrix — starting from true zero",()=>{
  it("shows no money at all for a certified complete empty company",()=>{
    const financial=buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:[],
    });
    expect(financial.trialBalance.totalDebitMinor).toBe("0");
    expect(financial.trialBalance.totalCreditMinor).toBe("0");
    expect(financial.trialBalance.closingDebitMinor).toBe("0");
    expect(financial.trialBalance.closingCreditMinor).toBe("0");
    expect(financial.incomeStatement.netEarningsMinor).toBe("0");
    expect(financial.balanceSheet.assetsMinor).toBe("0");
    expect(financial.balanceSheet.liabilitiesMinor).toBe("0");
    expect(financial.balanceSheet.recordedEquityMinor).toBe("0");
    expect(financial.balanceSheet.differenceMinor).toBe("0");
    expect(financial.organizationId).toBe(ORG);
    expect(financial.currency).toBe("PKR");
  });

  it("requires an authoritative complete source, not an unavailable source called zero",()=>{
    expect(()=>buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:false,accounts,journals:[],
    })).toThrow(/Incomplete financial source/i);
  });

  it("checks each double-entry draft without floating point or one-paisa imbalance",()=>{
    for (const [name,dr,cr,value] of movements) {
      const preview=previewJournalDraft({
        organizationId:ORG,currency:CURRENCY,businessDate:DATE,intentId:name,
        lines:[
          {lineId:"1",accountId:dr,debitMinor:money(value),creditMinor:"0"},
          {lineId:"2",accountId:cr,debitMinor:"0",creditMinor:money(value)},
        ],
      },{
        organizationId:ORG,currency:CURRENCY,
        periodStart:"2026-01-01",periodEnd:"2026-12-31",periodState:"open",
      },accounts);
      expect(preview.issues).toEqual([]);
      expect(preview.balanced).toBe(true);
      expect(preview.canSubmitForServerReview).toBe(true);
      expect(preview.debitMinor).toBe(money(value));
      expect(preview.creditMinor).toBe(money(value));
    }
  });

  it("recognizes AR/AP, cost of sales and accruals separately from cash, owner equity and profit",()=>{
    const report=buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:entries,
    });
    expect(report.incomeStatement).toEqual({
      revenueMinor:"20000",costOfSalesMinor:"12000",expensesMinor:"3000",
      otherIncomeMinor:"0",otherExpensesMinor:"0",netEarningsMinor:"5000",
    });
    expect(report.balanceSheet).toEqual({
      assetsMinor:"100000",liabilitiesMinor:"15000",
      recordedEquityMinor:"80000",unclosedEarningsMinor:"5000",
      totalEquityMinor:"85000",differenceMinor:"0",
    });
    expect(report.trialBalance.totalDebitMinor).toBe("187000");
    expect(report.trialBalance.totalCreditMinor).toBe("187000");
    expect(report.trialBalance.closingDebitMinor).toBe("135000");
    expect(report.trialBalance.closingCreditMinor).toBe("135000");
    const balances=Object.fromEntries(report.trialBalance.rows.map(row=>[
      row.accountId,[row.closingDebitMinor,row.closingCreditMinor],
    ]));
    expect(balances).toMatchObject({
      bank:["82000","0"],ar:["12000","0"],inventory:["6000","0"],
      ap:["0","12000"],"wages-pay":["0","3000"],capital:["0","100000"],
      drawings:["20000","0"],sales:["0","20000"],cogs:["12000","0"],
      payroll:["3000","0"],
    });
  });

  it("does not count future posted entries as current, nor delete reversed history",()=>{
    const future=posted(98,"bank","sales","25000","2026-12-01");
    const now=buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:[...entries,future],
    });
    expect(now.incomeStatement.netEarningsMinor).toBe("5000");
    const withFuture=buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:"2026-12-31",
      sourceComplete:true,accounts,journals:[...entries,future],
    });
    expect(withFuture.incomeStatement.netEarningsMinor).toBe("30000");
    const reversing=posted(99,"sales","bank","25000","2026-12-15");
    const net=buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:"2026-12-31",
      sourceComplete:true,accounts,journals:[...entries,future,reversing],
    });
    expect(net.incomeStatement.netEarningsMinor).toBe("5000");
    expect(net.trialBalance.totalDebitMinor).toBe("237000");
    expect(net.trialBalance.totalCreditMinor).toBe("237000");
  });

  it("refuses forged foreign-company records, altered posted entries and duplicate intent",()=>{
    const foreign={...entries[0],organizationId:"foreign-business"};
    const invalid=[...entries.slice(1),foreign];
    expect(()=>buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:invalid,
    })).toThrow(/different company/i);
    expect(()=>buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:[...entries,{...entries[0],id:"another",lines:entries[0].lines}],
    })).toThrow(/duplicate/i);
    const broken={...entries[0],lines:[
      {...entries[0].lines[0],debitMinor:"18001"},entries[0].lines[1],
    ]};
    expect(()=>buildFinancialSnapshot({
      organizationId:ORG,currency:CURRENCY,asOfDate:DATE,
      sourceComplete:true,accounts,journals:[broken],
    })).toThrow(/not exactly balanced/i);
  });
});
