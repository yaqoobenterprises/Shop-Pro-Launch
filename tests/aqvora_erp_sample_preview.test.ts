import {describe,it,expect} from "vitest";
import {buildFinancialSnapshot} from "../src/accounting/financialSnapshot";
import {sampleChart,sampleCompany,sampleJournals}
  from "../src/components/accounting/financeSampleData";
import {demoTotals,sampleInvoices,samplePKR,sampleReceipt}
  from "../src/components/accounting/erpSampleScenario";

describe("AQVORA unified sample ERP source integrity",()=>{
  it("invoice 15000 -> receipt 6000 -> open 9000 and second invoice 8000",()=>{
    expect(BigInt(sampleInvoices[0].faceMinor)-BigInt(sampleReceipt.amountMinor))
      .toBe(900000n);
    expect(demoTotals.revenueMinor).toBe(2300000n);
    expect(demoTotals.collectedMinor).toBe(600000n);
    expect(demoTotals.outstandingMinor).toBe(1700000n);
    expect(demoTotals.collectedMinor+demoTotals.outstandingMinor)
      .toBe(demoTotals.revenueMinor);
    expect(sampleReceipt.evidence).toContain("NOT bank verified");
    expect(samplePKR(demoTotals.outstandingMinor)).toBe("Rs 17,000.00");
  });
  it("reads the very same sample invoices and receipt through a balanced local GL/TB",()=>{
    const result=buildFinancialSnapshot({...sampleCompany,
      accounts:sampleChart,journals:sampleJournals});
    expect(result.incomeStatement.revenueMinor).toBe(demoTotals.revenueMinor.toString());
    expect(result.trialBalance.totalDebitMinor).toBe("2900000");
    expect(result.trialBalance.totalCreditMinor).toBe("2900000");
    expect(result.trialBalance.closingDebitMinor).toBe("2300000");
    expect(result.trialBalance.closingCreditMinor).toBe("2300000");
    expect(result.balanceSheet.assetsMinor).toBe("2300000");
    expect(result.balanceSheet.differenceMinor).toBe("0");
    const account=(id:string)=>result.trialBalance.rows.find(x=>x.accountId===id);
    expect(account("1100")?.closingDebitMinor).toBe("1700000");
    expect(account("1010")?.closingDebitMinor).toBe("600000");
    expect(account("4020")?.closingCreditMinor).toBe("2300000");
  });
  it("never reuses sample identifiers as real company UUIDs or claims cloud authority",()=>{
    expect(sampleCompany.organizationId).toBe("aqvora-sample-only");
    expect(sampleInvoices.every(x=>!/^\d{8}-/.test(x.id))).toBe(true);
    expect(sampleReceipt.status).toContain("sample only");
  });
});
