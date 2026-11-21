import {describe,expect,it} from "vitest";
import {initialAQVORAView} from "../src/config/releaseExperience";
import {assertAQVORAReleaseSafety,forbiddenAQVORAReleaseFlags}
  from "../scripts/aqvora-release-safety.mjs";

describe("AQVORA release-safe experience",()=>{
  it("preserves the original working ledger as the installed default",()=>{
    expect(initialAQVORAView(false)).toBe("chat");
    expect(initialAQVORAView(true)).toBe("aqvora-erp-preview");
  });
  it("refuses all accidentally enabled V2 staging/ERP sample flags in production",()=>{
    const unsafe={
      VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE:"true",
      VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS:"true",
      VITE_AQVORA_PREVIEW_DEFAULT:"true",
      VITE_ENABLE_COMPANY_SETUP_WIZARD:"true",
      VITE_ENABLE_FINANCE_UI_PREVIEW:"true",
      VITE_SUPABASE_URL:"https://example.supabase.co",
    };
    expect(forbiddenAQVORAReleaseFlags(unsafe)).toEqual([
      "VITE_AQVORA_PREVIEW_DEFAULT","VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE",
      "VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS","VITE_ENABLE_COMPANY_SETUP_WIZARD",
      "VITE_ENABLE_FINANCE_UI_PREVIEW",
    ]);
    expect(()=>assertAQVORAReleaseSafety(unsafe,"production"))
      .toThrow(/production build blocked/);
    for(const target of ["preview","development",undefined]){
      expect(()=>assertAQVORAReleaseSafety(unsafe,target)).not.toThrow();
    }
  });
  it("allows a public build only when V2 writer/review gates remain OFF",()=>{
    expect(()=>assertAQVORAReleaseSafety({
      VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE:"false",
      VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS:"false",
      VITE_AQVORA_PREVIEW_DEFAULT:"false",
      VITE_SUPABASE_URL:"https://example.supabase.co",
    },"production")).not.toThrow();
    expect(()=>assertAQVORAReleaseSafety({
      VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS:"true",
    },"production")).toThrow(/VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS/);
    expect(()=>assertAQVORAReleaseSafety({
      VITE_AQVORA_UNIFIED_WORKSPACE_PREVIEW:"true",
    },"production")).toThrow(/VITE_AQVORA_UNIFIED_WORKSPACE_PREVIEW/);
  });
});
