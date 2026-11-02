// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthorizationHardeningDb, orgA, orgB, managerId, ownerId,
  accountA, categoryA, draftA, crossShopDraft,
} from "./support/authorizationHardeningDb";

describe("authorization RPC and execution boundaries", () => {
  let db: Awaited<ReturnType<typeof createAuthorizationHardeningDb>>;

  beforeAll(async () => {
    db = await createAuthorizationHardeningDb();
  });

  afterAll(async () => db.close());

  it("posts a draft once and returns only the retry row from the authenticated shop", async () => {
    await db.exec("RESET ROLE");
    await db.query(`
      INSERT INTO public.transaction_drafts (
        id, organization_id, type, amount_paisa, category_id, business_date,
        device_entry_time, raw_text, created_by, created_by_name, idempotency_key
      ) VALUES ($1, $2, 'expense', 2500, $3, '2026-11-02',
        '2026-11-02T06:00:00Z', 'Quick expense: Supplies', $4, 'Manager', $5)
    `, [draftA, orgA, categoryA, managerId, `draft-${draftA}`]);

    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);

    const first = await db.query(
      "SELECT id, organization_id, amount_paisa FROM public.post_transaction_draft($1, $2)",
      [draftA, accountA],
    );
    expect(first.rows[0]).toMatchObject({
      organization_id: orgA,
      amount_paisa: 2500,
    });

    const retry = await db.query(
      "SELECT id, organization_id FROM public.post_transaction_draft($1, $2)",
      [draftA, accountA],
    );
    expect(retry.rows[0].id).toBe(first.rows[0].id);
    expect(retry.rows[0].organization_id).toBe(orgA);

    const counts = await db.query(
      "SELECT COUNT(*)::INT AS count FROM public.transactions WHERE organization_id = $1",
      [orgA],
    );
    expect(counts.rows[0].count).toBe(1);
  });

  it("does not reveal an idempotency retry row from another organization", async () => {
    await db.exec("RESET ROLE");
    await db.query(`
      INSERT INTO public.transactions (
        organization_id, type, amount_paisa, account_id, business_date,
        device_entry_time, raw_text, status, idempotency_key, created_by, created_by_name
      ) VALUES ($1, 'expense', 9900, $2, '2026-11-02',
        '2026-11-02T06:00:00Z', 'Shop B transaction', 'active', $3, $4, 'Owner B')
    `, [orgB, accountA, `draft-${crossShopDraft}`, ownerId]);

    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);

    await expect(db.query(
      "SELECT * FROM public.post_transaction_draft($1, $2)",
      [crossShopDraft, accountA],
    )).rejects.toThrow("Transaction draft was not found");

    const otherShop = await db.query(
      "SELECT organization_id, amount_paisa FROM public.transactions WHERE idempotency_key = $1",
      [`draft-${crossShopDraft}`],
    );
    expect(otherShop.rows[0]).toEqual({
      organization_id: orgB,
      amount_paisa: 9900,
    });
  });

  it("pins every security-definer helper and RPC to an empty search_path", async () => {
    const functions = await db.query(`
      SELECT
        n.nspname AS schema_name,
        p.proname AS function_name,
        p.proconfig AS settings
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE (n.nspname = 'public' AND p.proname IN (
        'get_auth_org_id', 'is_active_shop_member', 'ensure_my_profile', 'post_transaction_draft'
      )) OR (n.nspname = 'private' AND p.proname IN (
        'get_auth_user_org_ids', 'get_org_role', 'is_org_member', 'is_org_owner'
      ))
      ORDER BY n.nspname, p.proname
    `);
    expect(functions.rows).toHaveLength(8);
    for (const fn of functions.rows) {
      expect(fn.settings).toContain('search_path=""');
    }

    const wrapperSecurity = await db.query(`
      SELECT proname, prosecdef
      FROM pg_proc
      WHERE proname IN ('get_auth_org_id', 'is_active_shop_member')
      ORDER BY proname
    `);
    expect(wrapperSecurity.rows).toEqual([
      { proname: "get_auth_org_id", prosecdef: false },
      { proname: "is_active_shop_member", prosecdef: false },
    ]);

    const helperGrants = await db.query(`
      SELECT
        has_function_privilege('anon', 'private.get_auth_user_org_ids()', 'EXECUTE') AS anon_can_execute,
        has_function_privilege('authenticated', 'private.get_auth_user_org_ids()', 'EXECUTE') AS authenticated_can_execute
    `);
    expect(helperGrants.rows[0]).toEqual({
      anon_can_execute: false,
      authenticated_can_execute: true,
    });
  });
});
