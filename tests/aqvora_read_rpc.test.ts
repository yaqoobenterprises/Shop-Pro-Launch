// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GeneralLedgerPage, ReadCursor, TrialBalancePage } from "../src/accounting/readContracts";
import { readFixtureSql, readIds as i } from "./support/aqvoraReadFixture";

describe("AQVORA certified immutable journal readers", () => {
  const db = new PGlite();
  // Expected SQL errors must not abort the enclosing per-test rollback fixture.
  const query = async <T>(sql: string, params: unknown[] = []) => {
    await db.exec("SAVEPOINT read_case");
    try {
      const result = await db.query<T>(sql, params);
      await db.exec("RELEASE SAVEPOINT read_case");
      return result;
    } catch (error) {
      await db.exec("ROLLBACK TO SAVEPOINT read_case; RELEASE SAVEPOINT read_case");
      throw error;
    }
  };
  const user = async (id = i.owner, aal = "aal2") => {
    await db.exec("RESET ROLE");
    await query(`SELECT set_config('request.jwt.claim.sub',$1,false),
      set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claim.session_id',$1,false)`, [id, aal]);
    await db.exec("SET ROLE authenticated");
  };
  const post = async (key: string, amount = "101", date = "2026-11-20") => {
    const result = await query<{ receipt: { journal_id: string } }>(
      "SELECT public.post_aqvora_journal($1,$2,$3,$4::jsonb) AS receipt",
      [i.org,key,date,JSON.stringify([{ account_id: i.cash,debit_minor: amount,credit_minor: "0" },
        { account_id: i.sales,debit_minor: "0",credit_minor: amount }])]);
    return result.rows[0].receipt;
  };
  const tb = async (token: string | null = null, cursor: ReadCursor | null = null, limit = 100,
    org = i.org, from = "2026-11-01", to = "2026-11-30", currency = "PKR") => {
    const result = await query<{ report: TrialBalancePage }>(
      "SELECT public.read_aqvora_trial_balance($1,$2,$3,$4,$5,$6::jsonb,$7) AS report",
      [org,from,to,currency,limit,cursor === null ? null : JSON.stringify(cursor),token]);
    return result.rows[0].report;
  };
  const gl = async (token: string | null = null, cursor: ReadCursor | null = null, limit = 100,
    account = i.cash, from = "2026-11-01", to = "2026-11-30") => {
    const result = await query<{ report: GeneralLedgerPage }>(
      "SELECT public.read_aqvora_general_ledger($1,$2,$3,$4,'PKR',$5,$6::jsonb,$7) AS report",
      [i.org,account,from,to,limit,cursor === null ? null : JSON.stringify(cursor),token]);
    return result.rows[0].report;
  };
  beforeAll(async () => db.exec(readFixtureSql()));
  beforeEach(async () => { await db.exec("BEGIN"); await user(); });
  afterEach(async () => { await db.exec("ROLLBACK; RESET ROLE"); });
  afterAll(async () => db.close());

  it("certifies empty V2 books without claiming legacy or migration coverage", async () => {
    const report = await tb();
    expect(report.source).toMatchObject({ source_complete: true, basis: "v2_posted_journals",
      source_journal_count: "0", source_line_count: "0", legacy_included: false,
      opening_migration_verified: false, authorized_role: "OWNER" });
    expect(report.totals).toMatchObject({ debit_minor: "0", credit_minor: "0", closing_debit_minor: "0" });
    expect(report.rows).toHaveLength(2);
    expect(await gl(report.source.snapshot_token)).toMatchObject({ rows: [], matched_count: "0", has_more: false,
      next_cursor: null, opening_minor: "0", closing_minor: "0" });
  });
  it("reconciles brought-forward, movement and closing with the same source token", async () => {
    await post("opening-recorded", "500", "2026-10-31");
    await post("movement", "101");
    await post("after-cutoff", "200", "2026-12-01");
    const report = await tb();
    const ledger = await gl(report.source.snapshot_token);
    expect(ledger).toMatchObject({ opening_minor: "500", debit_minor: "101", credit_minor: "0", closing_minor: "601" });
    expect(ledger.rows[0]).toMatchObject({ intent_key: "movement", ordinal: "1", running_balance_minor: "601",
      account_id: i.cash, debit_minor: "101", reversal_of: null });
    expect(ledger.rows[0].audit_event_id).toMatch(/^\d+$/);
    expect(report.source.source_journal_count).toBe("2");
    expect(report.totals).toEqual({ opening_debit_minor: "500", opening_credit_minor: "500",
      debit_minor: "101", credit_minor: "101", closing_debit_minor: "601", closing_credit_minor: "601" });
    expect(report.rows[0].closing_minor).toBe(ledger.closing_minor);
  });
  it("aggregates beyond BIGINT exactly and keeps all wire amounts as strings", async () => {
    await post("large-a", "9223372036854775807");
    await post("large-b", "9223372036854775807");
    const report = await tb();
    expect(report.totals.debit_minor).toBe("18446744073709551614");
    expect((await gl(report.source.snapshot_token)).rows[1].running_balance_minor).toBe("18446744073709551614");
    expect(report.rows[0].account.revision).toBe("1");
  });
  it("keeps repeated lines of one voucher distinct with a running balance per line", async () => {
    await query("SELECT public.post_aqvora_journal($1,'split','2026-11-20',$2::jsonb)", [i.org,JSON.stringify([
      { account_id: i.cash,debit_minor: "50",credit_minor: "0" },
      { account_id: i.cash,debit_minor: "51",credit_minor: "0" },
      { account_id: i.sales,debit_minor: "0",credit_minor: "101" },
    ])]);
    const first = await gl(null,null,1);
    const second = await gl(first.source.snapshot_token,first.next_cursor,1);
    expect(first.rows[0]).toMatchObject({ line_no: 1,running_balance_minor: "50" });
    expect(second.rows[0]).toMatchObject({ line_no: 2,running_balance_minor: "101" });
    expect(second.source.source_line_count).toBe("3");
  });
  it("does not change a company fingerprint when another company posts", async () => {
    const token = (await tb()).source.snapshot_token;
    await user(i.outsider);
    await query("SELECT public.post_aqvora_journal($1,'foreign','2026-11-20',$2::jsonb)",[i.otherOrg,JSON.stringify([
      { account_id: i.foreign,debit_minor: "999",credit_minor: "0" },
      { account_id: i.foreign,debit_minor: "0",credit_minor: "999" },
    ])]);
    await user();
    expect((await tb(token)).source.source_journal_count).toBe("0");
    expect((await gl(token)).rows).toEqual([]);
  });
  it("counts linked reversals once at their effective date and preserves archived history", async () => {
    const original = await post("original");
    await query("SELECT public.reverse_aqvora_journal($1,$2,'reversal','2026-11-21','Correction')", [i.org,original.journal_id]);
    await db.exec("RESET ROLE");
    await query("UPDATE public.aqvora_accounts SET is_active=false WHERE organization_id=$1 AND id=$2", [i.org,i.cash]);
    await user();
    expect((await gl(null,null,100,i.cash,"2026-11-01","2026-11-20")).closing_minor).toBe("101");
    const ledger = await gl();
    expect(ledger).toMatchObject({ debit_minor: "101", credit_minor: "101", closing_minor: "0" });
    expect(ledger.account.is_active).toBe(false);
    expect(ledger.rows[1]).toMatchObject({ reversal_of: original.journal_id, reversal_reason: "Correction" });
    expect((await tb()).totals.closing_debit_minor).toBe("0");
  });
  it("paginates deterministically through date ties, replays cursors, and proves row coverage", async () => {
    for (let n = 0; n < 5; n++) await post(`entry-${n}`);
    const all = await gl();
    const first = await gl(null,null,2);
    const second = await gl(first.source.snapshot_token,first.next_cursor,2);
    const replay = await gl(first.source.snapshot_token,first.next_cursor,2);
    expect(replay.rows).toEqual(second.rows);
    const last = await gl(first.source.snapshot_token,second.next_cursor,2);
    expect([...first.rows,...second.rows,...last.rows]).toEqual(all.rows);
    expect(last).toMatchObject({ has_more: false, next_cursor: null, matched_count: "5" });
    const a = await tb(null,null,1);
    const b = await tb(a.source.snapshot_token,a.next_cursor,1);
    expect(b.rows[0].ordinal).toBe("2");
    expect(b.totals).toEqual(a.totals);
    expect(b.has_more).toBe(false);
    await expect(gl(null,first.next_cursor,2)).rejects.toThrow("requires its snapshot");
    await expect(gl(first.source.snapshot_token,{ ...first.next_cursor, account_id: i.sales },2)).rejects.toThrow("cursor");
    await expect(tb(a.source.snapshot_token,first.next_cursor,1)).rejects.toThrow("cursor");
  });
  it("fails closed on backdated posting and chart/period drift, while retries preserve the token", async () => {
    await post("retry");
    const before = await tb();
    await post("retry");
    expect((await tb(before.source.snapshot_token)).source.snapshot_token).toBe(before.source.snapshot_token);
    await post("backdated", "1", "2026-10-01");
    await expect(tb(before.source.snapshot_token)).rejects.toThrow("source changed");
    const current = await tb();
    await db.exec("RESET ROLE");
    await query("UPDATE public.aqvora_periods SET state='closed',revision=revision+1 WHERE organization_id=$1", [i.org]);
    await user();
    await expect(gl(current.source.snapshot_token)).rejects.toThrow("source changed");
    const closed = await tb();
    expect(closed.totals.debit_minor).toBe(current.totals.debit_minor);
    await db.exec("RESET ROLE");
    await query("UPDATE public.aqvora_periods SET state='open',reopen_count=1,revision=revision+1 WHERE organization_id=$1", [i.org]);
    await user();
    await expect(tb(closed.source.snapshot_token)).rejects.toThrow("source changed");
    const reopened = await tb();
    await db.exec("RESET ROLE");
    await query("UPDATE public.aqvora_accounts SET name='Renamed',revision=revision+1 WHERE organization_id=$1 AND id=$2", [i.org,i.cash]);
    await user();
    await expect(tb(reopened.source.snapshot_token)).rejects.toThrow("source changed");
  });
  it("authorizes canonical OWNER/MANAGER only and denies guessed foreign identifiers", async () => {
    await user(i.manager);
    expect((await tb()).source.authorized_role).toBe("MANAGER");
    await expect(tb(null,null,100,i.otherOrg)).rejects.toThrow("not authorized");
    await expect(gl(null,null,100,i.foreign)).rejects.toThrow("unavailable");
    await user(i.cashier);
    await expect(tb()).rejects.toThrow("not authorized");
    await user(i.outsider);
    await expect(gl()).rejects.toThrow("not authorized");
    await user(i.owner,"aal1");
    await expect(tb()).rejects.toThrow("MFA");
  });
  it("rechecks role demotion, inactive membership and revoked sessions even with a valid token", async () => {
    const token = (await tb()).source.snapshot_token;
    await db.exec("RESET ROLE");
    await query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2", [i.org,i.owner]);
    await user(); await expect(tb(token)).rejects.toThrow("not authorized");
    await db.exec("RESET ROLE");
    await query("UPDATE public.organization_members SET role='OWNER',is_active=false WHERE organization_id=$1 AND user_id=$2", [i.org,i.owner]);
    await user(); await expect(gl(token)).rejects.toThrow("not authorized");
    await db.exec("RESET ROLE");
    await query("UPDATE public.organization_members SET is_active=true WHERE organization_id=$1 AND user_id=$2", [i.org,i.owner]);
    await query("DELETE FROM auth.sessions WHERE user_id=$1", [i.owner]);
    await user(); await expect(tb(token)).rejects.toThrow("MFA");
  });
  it("rejects invalid dates, currencies, page sizes and mismatched filter tokens", async () => {
    for (const [from,to,currency] of [["2026-12-01","2026-11-01","PKR"],
      ["2026-02-30","2026-11-01","PKR"],["-infinity","2026-11-01","PKR"],
      ["2026-11-01","infinity","PKR"],["2026-11-01","2026-11-30","USD"],
      ["2026-11-01","2026-11-30","pkr"]]) {
      await expect(tb(null,null,100,i.org,from,to,currency)).rejects.toThrow();
    }
    for (const limit of [0,201,-1]) await expect(gl(null,null,limit)).rejects.toThrow("page size");
    const token = (await tb()).source.snapshot_token;
    await expect(gl(token,null,100,i.cash,"2026-11-02")).rejects.toThrow("source changed");
  });
  it("detects balanced but incomplete source headers instead of silently returning zero", async () => {
    await db.exec("RESET ROLE");
    await query(`INSERT INTO public.aqvora_journals
      (organization_id,intent_key,business_date,currency,period_id,payload,total_minor,posted_by)
      SELECT $1,'broken','2026-11-20','PKR',id,'{"lines":[]}',1,$2
      FROM public.aqvora_periods WHERE organization_id=$1`, [i.org,i.owner]);
    await user(); await expect(tb()).rejects.toThrow("incomplete");
    await expect(gl()).rejects.toThrow("incomplete");
  });
  it("detects extra inconsistent audit events even when financial totals still balance", async () => {
    const receipt = await post("audit-source");
    await db.exec("RESET ROLE");
    await query(`INSERT INTO public.aqvora_journal_audit(organization_id,journal_id,action,actor_id,details)
      VALUES ($1,$2,'REVERSE',$3,'{}')`,[i.org,receipt.journal_id,i.owner]);
    await user(); await expect(tb()).rejects.toThrow("incomplete");
  });
  it.each(["missing","numeric"])("rejects a balanced source with a %s canonical payload amount", async (kind) => {
    const original = await post("healthy");
    await db.exec("RESET ROLE");
    const journal = await query<{ id: string }>(`INSERT INTO public.aqvora_journals
      (organization_id,intent_key,business_date,currency,period_id,payload,total_minor,posted_by)
      SELECT organization_id,'corrupt-payload',business_date,currency,period_id,
        CASE WHEN $2='missing' THEN payload #- '{lines,0,debit_minor}'
          ELSE jsonb_set(payload,'{lines,0,debit_minor}','101'::jsonb) END,
        total_minor,posted_by FROM public.aqvora_journals WHERE organization_id=$3 AND id=$1 RETURNING id`,
    [original.journal_id,kind,i.org]);
    const id = journal.rows[0].id;
    await query(`INSERT INTO public.aqvora_journal_lines
      SELECT organization_id,$2,line_no,account_id,debit_minor,credit_minor,party_id,open_item_id,stock_movement_id
      FROM public.aqvora_journal_lines WHERE organization_id=$3 AND journal_id=$1`,[original.journal_id,id,i.org]);
    await query(`INSERT INTO public.aqvora_posting_receipts(organization_id,intent_key,journal_id,payload)
      SELECT organization_id,intent_key,id,payload FROM public.aqvora_journals WHERE organization_id=$1 AND id=$2`,[i.org,id]);
    await query(`INSERT INTO public.aqvora_journal_audit(organization_id,journal_id,action,actor_id,details)
      VALUES ($1,$2,'POST',$3,'{"reason":null,"reversal_of":null}')`,[i.org,id,i.owner]);
    await user(); await expect(tb()).rejects.toThrow("incomplete");
  });
  it("fails closed on company-currency drift rather than aggregating different units", async () => {
    await post("currency");
    await db.exec("RESET ROLE");
    await query("UPDATE public.organizations SET currency='USD' WHERE id=$1",[i.org]);
    await user();
    await expect(tb()).rejects.toThrow("currency");
    await expect(tb(null,null,100,i.org,"2026-11-01","2026-11-30","USD")).rejects.toThrow("incomplete");
  });
  it("denies anonymous/internal calls and all direct journal/audit mutations", async () => {
    const posted = await post("protected");
    await expect(query("DELETE FROM public.aqvora_journals WHERE id=$1", [posted.journal_id])).rejects.toThrow("permission");
    await expect(query("INSERT INTO public.aqvora_journal_lines VALUES ($1,$2,3,$3,1,0,null,null,null)",
      [i.org,posted.journal_id,i.cash])).rejects.toThrow("permission");
    await expect(query("SELECT private.aqvora_certify_read($1,'2026-11-01','2026-11-30','PKR',null)", [i.org])).rejects.toThrow("permission");
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(tb()).rejects.toThrow("permission");
    await db.exec("RESET ROLE");
    const properties = await query<{ proname: string; provolatile: string; prosecdef: boolean; proconfig: string[] }>(`
      SELECT proname,provolatile,prosecdef,proconfig FROM pg_proc
      WHERE proname IN ('aqvora_certify_read','read_aqvora_general_ledger','read_aqvora_trial_balance')`);
    expect(properties.rows).toHaveLength(3);
    for (const fn of properties.rows) {
      expect(fn).toMatchObject({ provolatile: "s",prosecdef: true });
      expect(fn.proconfig).toContain('search_path=""');
    }
    await expect(query("UPDATE public.aqvora_journal_audit SET action='REVERSE' WHERE journal_id=$1", [posted.journal_id])).rejects.toThrow("immutable");
  });
});
