import { describe, expect, it } from "vitest";
import { detectLedgerMateLanguage, getLedgerMateLanguageInstruction } from "../src/services/ledgerMateLanguage";

describe("LedgerMate response language", () => {
  it("matches English input with English", () => {
    expect(detectLedgerMateLanguage("How many transactions were voided this month?")).toBe("english");
    expect(getLedgerMateLanguageInstruction("How many transactions were voided this month?")).toContain("Reply in clear English");
  });

  it("keeps Roman Urdu in Latin script", () => {
    const question = "is month kitni transactions voided hui?";
    expect(detectLedgerMateLanguage(question)).toBe("roman-urdu");
    expect(getLedgerMateLanguageInstruction(question)).toContain("Latin letters only");
  });

  it("matches Urdu-script input with Urdu script", () => {
    const question = "Ø§Ø³ Ù…Ø§Û Ú©ØªÙ†ÛŒ Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø² void ÛÙˆØ¦ÛŒÚºØŸ";
    expect(detectLedgerMateLanguage(question)).toBe("urdu");
    expect(getLedgerMateLanguageInstruction(question)).toContain("Reply in Urdu script");
  });
});
