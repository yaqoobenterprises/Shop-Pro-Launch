import { describe, expect, it, vi } from "vitest";
import { isExpectedOAuthMessage } from "../src/lib/oauthMessages";
import { transactionSearchFilter, matchesTransactionSearch } from "../src/services/ledgerSearch";
import { coalesceLedgerRead } from "../src/services/ledgerReadCoalescer";
describe("trusted popup messages", () => {
  const popup = {} as Window;
  const origin = "https://shop-pro-launch.vercel.app";
  it("rejects another origin, another window and unsolicited messages", () => {
    const message = { origin, source: popup, data: { type: "OAUTH_AUTH_SUCCESS" } };
    expect(isExpectedOAuthMessage(message, origin, popup)).toBe(true);
    expect(isExpectedOAuthMessage({ ...message, origin: "https://untrusted.example" }, origin, popup)).toBe(false);
    expect(isExpectedOAuthMessage({ ...message, source: {} as Window }, origin, popup)).toBe(false);
    expect(isExpectedOAuthMessage(message, origin, null)).toBe(false);
    expect(isExpectedOAuthMessage({ ...message, data: { type: "unrelated" } }, origin, popup)).toBe(false);
  });
});
describe("entry search parity", () => {
  it("finds notes locally and quotes delimiters in remote filter values", () => {
    expect(matchesTransactionSearch({ raw_text: "PRINT 100", note: "Invoice for school" }, "SCHOOL")).toBe(true);
    expect(matchesTransactionSearch({ raw_text: "PRINT 100", note: null }, "school")).toBe(false);
    expect(transactionSearchFilter('a,b)"%_')).toBe('raw_text.ilike."%a,b)\\"\\%\\_%",note.ilike."%a,b)\\"\\%\\_%"');
  });
});
describe("scoped concurrent reads", () => {
  it("coalesces one scope, separates accounts and re-reads after settlement", async () => {
    let resolve!: (value: number[]) => void;
    const load = vi.fn(() => new Promise<number[]>(done => { resolve = done; }));
    const a = coalesceLedgerRead("shop-a:user-a", load);
    const b = coalesceLedgerRead("shop-a:user-a", load);
    const other = coalesceLedgerRead("shop-b:user-b", async () => [9]);
    expect(load).toHaveBeenCalledOnce(); resolve([1]);
    expect(await a).toEqual([1]); expect(await b).toEqual([1]); expect(await other).toEqual([9]);
    expect(await coalesceLedgerRead("shop-a:user-a", async () => [2])).toEqual([2]);
  });
});

describe("category palette identity", () => {
  it("keeps each category color when a reporting period reorders or filters the categories", async () => {
    const { categoryColorIndex } = await import("../src/components/charts/echartsOptions");
    const first = categoryColorIndex("refinement-test:utilities");
    const second = categoryColorIndex("refinement-test:supplies");
    expect(second).not.toBe(first);
    expect(categoryColorIndex("refinement-test:supplies")).toBe(second);
    expect(categoryColorIndex("refinement-test:utilities")).toBe(first);
  });
});
