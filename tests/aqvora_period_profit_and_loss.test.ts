import {describe, expect, it} from "vitest";
import {buildPeriodProfitAndLoss} from "../src/accounting/periodProfitAndLoss";
import type {AccountingSnapshotInput, ChartAccount, PostedJournal} from "../src/accounting/types";

const org="fresh-pnl-company";
const base:Omit<ChartAccount,"id"|"code"|"name"|"accountClass"|"normalSide">={
  organizationId:org,parentId:null,isActive:true,isPosting:true,
};
const accounts:ChartAccount[]=[
  { ...base,id:"cash",code:"1010",name:"Bank",accountClass:"asset",normalSide:"debit" },
  { ...base,id:"sales",code:"4010",name:"Services",accountClass:"revenue",normalSide:"credit" },
  { ...base,id:"cost",code:"5010",name:"Cost of Sales",accountClass:"cost_of_sales",normalSide:"debit" },
  { ...base,id:"expense",code:"6010",name:"Operating Expense",accountClass:"expense",normalSide:"debit" },
  { ...base,id:"other",code:"7010",name:"Other Income",accountClass:"other_income",normalSide:"credit" },
  { ...base,id:"other-exp",code:"8010",name:"Other Expense",accountClass:"other_expense",normalSide:"debit" },
];
function entry(id:string,date:string,dr:string,cr:string,amount:string):PostedJournal {
  return {id,organizationId:org,intentId:"intent-"+id,businessDate:date,status:"posted",
    currency:"PKR",lines:[
      {lineId:id+"-1",accountId:dr,debitMinor:amount,creditMinor:"0"},
      {lineId:id+"-2",accountId:cr,debitMinor:"0",creditMinor:amount},
    ],
  };
}
const journals:PostedJournal[]=[
  entry("oct-sales","2026-10-15","cash","sales","900000"),
  entry("nov-sales","2026-11-03","cash","sales","200000"),
  entry("nov-cost","2026-11-05","cost","cash","50000"),
  entry("nov-office","2026-11-07","expense","cash","25000"),
  entry("nov-other-income","2026-11-11","cash","other","10000"),
  entry("nov-other-expense","2026-11-15","other-exp","cash","3000"),
  entry("dec-sales","2026-12-15","cash","sales","500000"),
];
const snapshot:AccountingSnapshotInput={
  organizationId:org,currency:"PKR",asOfDate:"2026-12-31",
  sourceComplete:true,accounts,journals,
};
describe("AQVORA exact period Profit and Loss",()=>{
  it("excludes prior and future months, returning correct November results",()=>{
    const report=buildPeriodProfitAndLoss(snapshot,"2026-11-01","2026-11-30");
    expect(report).toEqual({
      organizationId:org,currency:"PKR",
      periodStart:"2026-11-01",periodEnd:"2026-11-30",
      revenueMinor:"200000",costOfSalesMinor:"50000",
      grossProfitMinor:"150000",expensesMinor:"25000",
      otherIncomeMinor:"10000",otherExpensesMinor:"3000",
      netEarningsMinor:"132000",
    });
    const empty=buildPeriodProfitAndLoss(snapshot,"2026-09-01","2026-09-30");
    expect(empty.netEarningsMinor).toBe("0");
    expect(empty.revenueMinor).toBe("0");
  });

  it("can compare October/December with exact totals without double-counting November",()=>{
    const october=buildPeriodProfitAndLoss(snapshot,"2026-10-01","2026-10-31");
    const november=buildPeriodProfitAndLoss(snapshot,"2026-11-01","2026-11-30");
    const december=buildPeriodProfitAndLoss(snapshot,"2026-12-01","2026-12-31");
    const all=buildPeriodProfitAndLoss(snapshot,"2026-10-01","2026-12-31");
    expect(october.netEarningsMinor).toBe("900000");
    expect(december.netEarningsMinor).toBe("500000");
    expect(BigInt(october.netEarningsMinor)+BigInt(november.netEarningsMinor)+
      BigInt(december.netEarningsMinor)).toBe(BigInt(all.netEarningsMinor));
  });

  it("includes reversing journals in the correct reversal period, never deleting history",()=>{
    const reversed:AccountingSnapshotInput={
      ...snapshot,journals:[
        ...journals,
        entry("reverse-december-sale","2026-12-16","sales","cash","500000"),
      ],
    };
    const dec=buildPeriodProfitAndLoss(reversed,"2026-12-01","2026-12-31");
    expect(dec.revenueMinor).toBe("0");
    expect(dec.netEarningsMinor).toBe("0");
    const nov=buildPeriodProfitAndLoss(reversed,"2026-11-01","2026-11-30");
    expect(nov.netEarningsMinor).toBe("132000");
  });

  it("fails closed on missing source evidence, invalid dates, another company or broken journals",()=>{
    expect(()=>buildPeriodProfitAndLoss({...snapshot,sourceComplete:false},
      "2026-11-01","2026-11-30")).toThrow(/Incomplete financial source/);
    for(const [start,end] of [
      ["2026-11-31","2026-12-15"],
      ["2026-12-01","2026-11-01"],
      ["2027-01-01","2027-01-31"],
    ]){
      expect(()=>buildPeriodProfitAndLoss(snapshot,start,end)).toThrow(/valid period/);
    }
    expect(()=>buildPeriodProfitAndLoss({...snapshot,asOfDate:"bad"},
      "2026-11-01","2026-11-30")).toThrow(/valid period/);
    expect(()=>buildPeriodProfitAndLoss({...snapshot,journals:[
      ...journals,{...journals[0],organizationId:"other-company",id:"foreign",intentId:"foreign"},
    ]},"2026-11-01","2026-11-30")).toThrow(/different company/);
    expect(()=>buildPeriodProfitAndLoss({...snapshot,journals:[
      ...journals,{...journals[0],id:"duplicate-intent"},
    ]},"2026-11-01","2026-11-30")).toThrow(/duplicate/);
  });
});
