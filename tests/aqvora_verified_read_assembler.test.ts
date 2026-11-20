import { describe, expect, it, vi } from "vitest";
import { readVerifiedGeneralLedger } from "../src/accounting/verifiedGeneralLedger";
import { readVerifiedTrialBalance } from "../src/accounting/verifiedTrialBalance";

const organization = "company-a";
const token = "a".repeat(64);
const account = (id: string, code: string, name: string) => ({
  organization_id: organization, id, code, name, account_class: "asset",
  normal_side: "debit", parent_id: null, is_posting: true, is_active: true,
  control_role: null, revision: "1",
});
const source = () => ({
  contract_version: "aqvora-read-v1", organization_id: organization,
  currency: "PKR", from_date: "2026-11-01", to_date: "2026-11-30",
  snapshot_token: token, observed_at: "2026-11-20T00:00:00Z",
  authorized_user_id: "manager-a", authorized_role: "MANAGER",
  basis: "v2_posted_journals", source_complete: true,
  legacy_included: false, opening_migration_verified: false,
  consistency: "restart_on_source_change",
  source_journal_count: "1", source_line_count: "3",
  source_debit_minor: "100", source_credit_minor: "100",
});
const glRequest = {
  p_organization_id: organization, p_account_id: "cash",
  p_from_date: "2026-11-01", p_to_date: "2026-11-30",
  p_currency: "PKR",
};
const tbRequest = {
  p_organization_id: organization,
  p_from_date: "2026-11-01", p_to_date: "2026-11-30",
  p_currency: "PKR",
};
const glRow = (line: number) => ({
  journal_id: "journal-a", intent_key: "intent-a", business_date: "2026-11-15",
  posted_at: "2026-11-15T12:00:00Z", posted_by: "manager-a",
  period_id: "period-a", reversal_of: null, reversal_reason: null,
  line_no: line, account_id: "cash", debit_minor: "50",
  credit_minor: "0", party_id: null, open_item_id: null,
  stock_movement_id: null, audit_event_id: "audit-a",
  ordinal: String(line), running_balance_minor: String(line * 50),
});
const glCursor = {
  snapshot_token: token, kind: "general_ledger", account_id: "cash",
  business_date: "2026-11-15", journal_id: "journal-a", line_no: 1,
};
const glPage = (page = 1) => ({
  source: source(), account: account("cash", "1000", "Cash"),
  opening_minor: "0", debit_minor: "100", credit_minor: "0",
  closing_minor: "100", matched_count: "2", returned_count: 1,
  has_more: page === 1, next_cursor: page === 1 ? glCursor : null,
  rows: [glRow(page)],
});
const tbRow = (id: string, ordinal: string) => ({
  account: account(id, id === "cash" ? "1000" : "4000",
    id === "cash" ? "Cash" : "Revenue"),
  ordinal, opening_minor: "0",
  debit_minor: id === "cash" ? "100" : "0",
  credit_minor: id === "cash" ? "0" : "100",
  closing_minor: id === "cash" ? "100" : "-100",
  closing_debit_minor: id === "cash" ? "100" : "0",
  closing_credit_minor: id === "cash" ? "0" : "100",
});
const tbCursor = {
  snapshot_token: token, kind: "trial_balance", account_id: "cash",
  code: "1000",
};
const tbTotals = () => ({
  opening_debit_minor: "0", opening_credit_minor: "0",
  debit_minor: "100", credit_minor: "100",
  closing_debit_minor: "100", closing_credit_minor: "100",
});
const tbPage = (page = 1) => ({
  source: source(), matched_count: "2", returned_count: 1,
  has_more: page === 1, next_cursor: page === 1 ? tbCursor : null,
  totals: tbTotals(),
  rows: [page === 1 ? tbRow("cash", "1") : tbRow("revenue", "2")],
});

describe("AQVORA V2 all-or-nothing ledger-read client assembly", () => {
  it("collects verified GL with one token and exact running balance across pages", async () => {
    const rpc = vi.fn(async (args: Record<string, unknown>) =>
      args.p_cursor ? glPage(2) : glPage(1));
    const report = await readVerifiedGeneralLedger(rpc, glRequest, {pageSize: 1});
    expect(report.rows).toHaveLength(2);
    expect(report.rows[1]?.running_balance_minor).toBe("100");
    expect(report).toMatchObject({
      openingMinor: "0", debitMinor: "100", closingMinor: "100",
      matchedCount: "2", pageCount: 2,
    });
    expect(report.source.legacy_included).toBe(false);
    expect(report.source.opening_migration_verified).toBe(false);
    expect(rpc.mock.calls[0]?.[0]).toMatchObject({p_cursor: null, p_snapshot_token: null});
    expect(rpc.mock.calls[1]?.[0]).toMatchObject({
      p_cursor: glCursor, p_snapshot_token: token,
    });
  });

  it("collects Trial Balance and reconciles full account totals, not just one page", async () => {
    const rpc = vi.fn(async (args: Record<string, unknown>) =>
      args.p_cursor ? tbPage(2) : tbPage(1));
    const report = await readVerifiedTrialBalance(rpc, tbRequest, {pageSize: 1});
    expect(report.rows).toHaveLength(2);
    expect(report.totals).toEqual(tbTotals());
    expect(report.matchedCount).toBe("2");
    expect(report.source.basis).toBe("v2_posted_journals");
  });

  it("does not call a backend with invalid request date/currency or page settings", async () => {
    const rpc = vi.fn(async () => tbPage());
    await expect(readVerifiedTrialBalance(rpc, {...tbRequest,p_currency: "pkr"}))
      .rejects.toThrow(/Invalid financial report request/);
    await expect(readVerifiedTrialBalance(rpc, {...tbRequest,p_from_date: "2026-12-01"}))
      .rejects.toThrow(/Invalid financial report request/);
    await expect(readVerifiedTrialBalance(rpc, tbRequest,{pageSize: 0}))
      .rejects.toThrow(/Invalid bounded/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong tenant", {source: {...source(), organization_id: "company-b"}}, /context mismatch/],
    ["pretended complete", {source: {...source(), source_complete: false}}, /not a complete certified/],
    ["unsupported legacy books", {source: {...source(), legacy_included: true}}, /not a complete certified/],
    ["opening flag", {source: {...source(), opening_migration_verified: true}}, /not a complete certified/],
    ["wrong role", {source: {...source(), authorized_role: "CASHIER"}}, /authorization role/],
    ["invalid token", {source: {...source(), snapshot_token: "not-sha256"}}, /snapshot token/],
    ["unbalanced certification", {source: {...source(), source_credit_minor: "99"}}, /arithmetically/],
    ["bad count", {returned_count: 2}, /row count/],
    ["bad next cursor", {next_cursor: {...glCursor,kind: "trial_balance"}}, /another report/],
    ["missing next cursor", {next_cursor: null}, /continuation flag/],
  ] as const)("refuses a GL page with %s", async (_label, changed, error) => {
    await expect(readVerifiedGeneralLedger(async () => ({
      ...glPage(), ...changed,
    }), glRequest, {pageSize: 1})).rejects.toThrow(error);
  });

  it("rejects an authorization identity change while the token remains identical", async () => {
    await expect(readVerifiedGeneralLedger(async args => args.p_cursor
      ? {...glPage(2),source: {...source(),authorized_user_id: "other-user"}}
      : glPage(1), glRequest, {pageSize: 1}))
      .rejects.toThrow(/source changed/);
  });

  it("rejects 40001 source drift and does not return a partially collected report", async () => {
    const rpc = vi.fn(async (args: Record<string, unknown>) => {
      if (args.p_cursor) throw Object.assign(new Error("source changed"),{code: "40001"});
      return glPage(1);
    });
    await expect(readVerifiedGeneralLedger(rpc, glRequest, {pageSize: 1}))
      .rejects.toMatchObject({code: "40001"});
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("detects page ordinal gaps, repeated cursors and invalid terminal counts", async () => {
    await expect(readVerifiedGeneralLedger(async args => args.p_cursor
      ? {...glPage(2), rows: [{...glRow(2),ordinal: "1"}]}
      : glPage(1), glRequest, {pageSize: 1}))
      .rejects.toThrow(/gap or duplicate/);
    await expect(readVerifiedGeneralLedger(async () => glPage(1), glRequest, {pageSize: 1}))
      .rejects.toThrow(/cursor loop/);
    await expect(readVerifiedGeneralLedger(async () => ({
      ...glPage(1),has_more: false,next_cursor: null,
    }), glRequest, {pageSize: 1}))
      .rejects.toThrow(/incomplete/);
  });

  it("rejects wrong GL running balance, line side and period totals", async () => {
    for(const change of [
      {rows: [{...glRow(1),running_balance_minor: "51"}]},
      {rows: [{...glRow(1),debit_minor: "-1"}]},
      {rows: [{...glRow(1),credit_minor: "50"}]},
      {opening_minor: "1"},
    ]) {
      await expect(readVerifiedGeneralLedger(async () => ({
        ...glPage(), ...change,
      }), glRequest, {pageSize: 1})).rejects.toThrow();
    }
  });

  it("rejects Trial Balance row math, missing rows, duplicated accounts and forged totals", async () => {
    await expect(readVerifiedTrialBalance(async args => args.p_cursor
      ? {...tbPage(2),rows: [{...tbRow("revenue","2"),closing_minor: "-99"}]}
      : tbPage(1), tbRequest, {pageSize: 1}))
      .rejects.toThrow(/row amounts do not reconcile/);
    await expect(readVerifiedTrialBalance(async args => args.p_cursor
      ? {...tbPage(2),rows: [tbRow("cash","2")]}
      : tbPage(1), tbRequest, {pageSize: 1}))
      .rejects.toThrow(/duplicated/);
    await expect(readVerifiedTrialBalance(async args => args.p_cursor
      ? {...tbPage(2),totals: {...tbTotals(),debit_minor: "101"}}
      : tbPage(1), tbRequest, {pageSize: 1}))
      .rejects.toThrow(/totals or account identity changed/);
    await expect(readVerifiedTrialBalance(async () => ({
      ...tbPage(), totals: {...tbTotals(),credit_minor: "99"},
    }), tbRequest, {pageSize: 1})).rejects.toThrow(/unbalanced/);
  });

  it("fails closed when page bounds cannot cover the complete report", async () => {
    await expect(readVerifiedTrialBalance(async args => args.p_cursor
      ? tbPage(2) : tbPage(1), tbRequest, {pageSize: 1,maxPages: 1}))
      .rejects.toThrow(/pagination limit/);
    await expect(readVerifiedTrialBalance(async () => tbPage(),tbRequest,{
      pageSize: 1,maxRows: 1,
    })).rejects.toThrow(/bounded row count/);
  });

  it("accepts exact source aggregate amounts exceeding signed BIGINT", async () => {
    const huge = "18446744073709551614";
    const report = await readVerifiedTrialBalance(async args => ({
      ...tbPage(args.p_cursor ? 2 : 1),
      source: {...source(),source_debit_minor: huge,source_credit_minor: huge},
    }), tbRequest, {pageSize: 1});
    expect(report.source.source_debit_minor).toBe(huge);
  });
});
