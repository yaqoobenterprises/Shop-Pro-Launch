import { describe, it, expect, vi, beforeEach } from "vitest";
import { ledgerService } from "../src/services/ledgerService";
import { SEED_CATEGORIES } from "../src/parser";

describe("New User & Unseeded Shop Ledger Refresh Resilience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getParserCategories gracefully returns SEED_CATEGORIES without throwing error", async () => {
    // Calling getParserCategories should never reject with 'Ledger data could not be refreshed'
    const categories = await ledgerService.getParserCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThanOrEqual(SEED_CATEGORIES.length);
  });

  it("getSuggestedParserCategories returns valid categories without crashing", async () => {
    const suggestions = await ledgerService.getSuggestedParserCategories();
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("getTransactionDrafts never throws on unseeded or offline organization", async () => {
    const drafts = await ledgerService.getTransactionDrafts("2026-10-11");
    expect(Array.isArray(drafts)).toBe(true);
  });

  it("getPaymentAccounts returns array without throwing on unseeded shop", async () => {
    const accounts = await ledgerService.getPaymentAccounts();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it("ChatView does not show a setup banner while the ledger opens with no accounts", async () => {
    const chatViewSource = await import("../src/components/chat/ChatView?raw");
    expect(chatViewSource.default).not.toContain("Set up your shop's cash drawer or bank account");
    expect(chatViewSource.default).not.toContain("Configure Accounts");
  });
});
