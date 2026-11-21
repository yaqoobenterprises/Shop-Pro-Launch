import {describe,expect,it} from "vitest";
import {
  buildSampleActivity,percentCollected,sampleActivity,
} from "../src/components/accounting/erpSampleActivity";
import {
  demoTotals,sampleInvoices,sampleReceipt,
} from "../src/components/accounting/erpSampleScenario";
import {buildFinancialSnapshot} from "../src/accounting/financialSnapshot";
import {sampleCompany,sampleJournals} from "../src/components/accounting/financeSampleData";

describe("AQVORA founder-locked source-traceable sample analytics",()=>{
  it("plots ONLY real synthetic invoice issue and cash receipt dates",()=>{
    expect(sampleActivity).toHaveLength(7);
    expect(sampleActivity[0].date).toBe("2026-11-15");
    expect(sampleActivity[6].date).toBe("2026-11-21");
    const amount=(date:string)=>sampleActivity.find(p=>p.date===date);
    expect(amount("2026-11-18")).toMatchObject({
      invoicedMinor:1500000n,collectedMinor:0n,
    });
    expect(amount("2026-11-19")).toMatchObject({
      invoicedMinor:800000n,collectedMinor:0n,
    });
    expect(amount("2026-11-20")).toMatchObject({
      invoicedMinor:0n,collectedMinor:600000n,
    });
    expect(sampleActivity.filter(x=>x.invoicedMinor===0n&&x.collectedMinor===0n))
      .toHaveLength(4);
  });
  it("reconciles chart sums, ERP KPIs, receipt and the balanced journal read model",()=>{
    const total=sampleActivity.reduce((acc,p)=>({
      invoiced:acc.invoiced+p.invoicedMinor,
      collected:acc.collected+p.collectedMinor,
    }),{invoiced:0n,collected:0n});
    expect(total.invoiced).toBe(demoTotals.revenueMinor);
    expect(total.collected).toBe(demoTotals.collectedMinor);
    expect(total.invoiced-total.collected).toBe(demoTotals.outstandingMinor);
    const certified=buildFinancialSnapshot({...sampleCompany,journals:sampleJournals});
    expect(total.invoiced.toString()).toBe(certified.incomeStatement.revenueMinor);
    expect(demoTotals.outstandingMinor.toString())
      .toBe(certified.trialBalance.rows.find(row=>row.accountId==="1100")?.closingDebitMinor);
    expect(percentCollected(total.collected,total.invoiced)).toBe(26.1);
  });
  it("changes graph series when the source invoices or receipts change",()=>{
    const adjusted=buildSampleActivity(
      [{...sampleInvoices[0],faceMinor:"1500001",receivedMinor:"600000"}],
      [sampleReceipt],"2026-11-21",
    );
    expect(adjusted.find(p=>p.date==="2026-11-18")?.invoicedMinor).toBe(1500001n);
    expect(adjusted.find(p=>p.date==="2026-11-20")?.collectedMinor).toBe(600000n);
  });
  it("refuses mismatched receipt allocation, missing invoices and duplicate documents",()=>{
    const badReceipt=(extra:Partial<typeof sampleReceipt>)=>({...sampleReceipt,...extra});
    expect(()=>buildSampleActivity(sampleInvoices,[
      badReceipt({amountMinor:"600001"}),"ignored" as never,
    ],"2026-11-21")).toThrow();
    expect(()=>buildSampleActivity(sampleInvoices,[
      badReceipt({invoiceId:"INV-FOREIGN"}),
    ],"2026-11-21")).toThrow(/Unmatched/);
    expect(()=>buildSampleActivity([sampleInvoices[0],sampleInvoices[0]],[
      sampleReceipt,
    ],"2026-11-21")).toThrow(/Duplicate/);
    expect(()=>buildSampleActivity([
      {...sampleInvoices[0],receivedMinor:"1500001"},
    ],[],"2026-11-21")).toThrow(/overallocated/);
  });
  it("rejects invalid dates, exact money, overflow and impossible ratio",()=>{
    for(const wrong of ["2026-02-30","2026-13-01","21-11-2026"]){
      expect(()=>buildSampleActivity(sampleInvoices,[sampleReceipt],wrong)).toThrow();
    }
    for(const wrong of ["1.00","-1","1e3"," 20","9223372036854775808"]){
      expect(()=>buildSampleActivity(
        [{...sampleInvoices[0],faceMinor:wrong}],[sampleReceipt],"2026-11-21",
      )).toThrow();
    }
    expect(()=>buildSampleActivity(sampleInvoices,[sampleReceipt],"2026-11-21",0))
      .toThrow(/2–31/);
    expect(()=>percentCollected(1001n,1000n)).toThrow();
    expect(percentCollected(0n,0n)).toBe(0);
  });
});
