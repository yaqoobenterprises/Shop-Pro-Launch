// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261017062800_launch_authorization_hardening.sql"),
  "utf8",
);

const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const managerId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const inactiveId = "33333333-3333-4333-8333-333333333333";
const cashierId = "88888888-8888-4888-8888-888888888888";
const accountA = "44444444-4444-4444-8444-444444444444";
const categoryA = "55555555-5555-4555-8555-555555555555";
const draftA = "66666666-6666-4666-8666-666666666666";
const crossShopDraft = "77777777-7777-4777-8777-777777777777";

describe("pending authorization-hardening migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT USAGE ON SCHEMA private TO authenticated;

      CREATE FUNCTION auth.uid() RETURNS UUID
      LANGUAGE SQL STABLE
      AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      CREATE TABLE auth.users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::JSONB
      );

      CREATE TABLE public.organizations (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'PKR',
        currency_symbol TEXT NOT NULL DEFAULT 'Rs.'
      );

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        organization_id UUID,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE public.organization_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (organization_id, user_id)
      );

      CREATE TABLE public.shop_members (
        user_id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL
      );

      CREATE TABLE public.categories (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE public.payment_accounts (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE public.transaction_drafts (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        type TEXT NOT NULL,
        amount_paisa BIGINT NOT NULL,
        category_id UUID,
        adjustment_dir TEXT,
        business_date DATE NOT NULL,
        device_entry_time TIMESTAMPTZ NOT NULL,
        note TEXT,
        raw_text TEXT NOT NULL,
        created_by UUID NOT NULL,
        created_by_name TEXT NOT NULL,
        idempotency_key TEXT NOT NULL
      );

      CREATE TABLE public.transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        type TEXT NOT NULL,
        amount_paisa BIGINT NOT NULL,
        category_id UUID,
        account_id UUID NOT NULL,
        adjustment_dir TEXT,
        business_date DATE NOT NULL,
        device_entry_time TIMESTAMPTZ NOT NULL,
        note TEXT,
        raw_text TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_by UUID NOT NULL,
        created_by_name TEXT NOT NULL
      );

      -- PGlite does not fully emulate SECURITY DEFINER ownership changes. Grant
      -- the underlying table privileges used by the same RPCs in production,
      -- while retaining the RLS policies under test on organizations, categories
      -- and transaction_drafts.
      GRANT SELECT, INSERT, UPDATE ON auth.users TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON public.organization_members TO authenticated;
      GRANT SELECT, INSERT, UPDATE ON public.shop_members TO authenticated;
      GRANT SELECT ON public.payment_accounts, public.categories TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_drafts TO authenticated;
      GRANT ALL ON public.categories TO authenticated;
      CREATE FUNCTION private.has_permission(target_org UUID, permission_name TEXT)
      RETURNS BOOLEAN
      LANGUAGE SQL
      SECURITY DEFINER
      SET search_path = public
      AS $
        SELECT EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = target_org
            AND user_id = (SELECT auth.uid())
            AND is_active = TRUE
            AND (
              role = 'OWNER'
              OR (role = 'MANAGER' AND permission_name = 'MANAGE_INVENTORY')
            )
        );
      $;
      REVOKE ALL ON FUNCTION private.has_permission(UUID, TEXT) FROM PUBLIC, anon;
      GRANT EXECUTE ON FUNCTION private.has_permission(UUID, TEXT) TO authenticated;

      CREATE FUNCTION public.seed_shop_defaults(target_org UUID)
      RETURNS VOID LANGUAGE SQL AS $ SELECT; $;

      ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.transaction_drafts ENABLE ROW LEVEL SECURITY;

      -- Model the live, permissive legacy policies that the migration replaces.
      CREATE POLICY "Members can view their organization"
      ON public.organizations FOR SELECT TO authenticated
      USING (id IN (
        SELECT organization_id FROM public.shop_members
        WHERE user_id = (SELECT auth.uid())
      ));
      CREATE POLICY organizations_select
      ON public.organizations FOR SELECT TO authenticated
      USING (id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = (SELECT auth.uid()) AND is_active
      ));
      CREATE POLICY organizations_update
      ON public.organizations FOR UPDATE TO authenticated
      USING (id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = (SELECT auth.uid()) AND is_active
      ))
      WITH CHECK (id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = (SELECT auth.uid()) AND is_active
      ));

      CREATE POLICY "Members can insert categories"
      ON public.categories FOR INSERT TO authenticated
      WITH CHECK (TRUE);
      CREATE POLICY "Members can read categories"
      ON public.categories FOR SELECT TO authenticated
      USING (TRUE);
      CREATE POLICY "Members can update categories"
      ON public.categories FOR UPDATE TO authenticated
      USING (TRUE) WITH CHECK (TRUE);
      CREATE POLICY categories_select
      ON public.categories FOR SELECT TO authenticated
      USING (private.is_org_member(organization_id));
      CREATE POLICY categories_write
      ON public.categories FOR ALL TO authenticated
      USING (private.has_permission(organization_id, 'MANAGE_INVENTORY'))
      WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));

      CREATE POLICY transaction_drafts_select
      ON public.transaction_drafts FOR SELECT TO authenticated
      USING (TRUE);
      CREATE POLICY transaction_drafts_insert
      ON public.transaction_drafts FOR INSERT TO authenticated
      WITH CHECK (TRUE);
      CREATE POLICY transaction_drafts_update
      ON public.transaction_drafts FOR UPDATE TO authenticated
      USING (TRUE) WITH CHECK (TRUE);
      CREATE POLICY transaction_drafts_delete
      ON public.transaction_drafts FOR DELETE TO authenticated
      USING (TRUE);

      GRANT SELECT, UPDATE ON public.organizations TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_drafts TO authenticated;
      GRANT ALL ON public.transaction_drafts TO anon, PUBLIC;

      INSERT INTO public.organizations (id, name, owner_name)
      VALUES
        ('${orgA}', 'Shop A', 'Owner A'),
        ('${orgB}', 'Shop B', 'Owner B');

      INSERT INTO auth.users (id, email)
      VALUES
        ('${managerId}', 'manager@example.test'),
        ('${ownerId}', 'owner@example.test'),
        ('${inactiveId}', 'inactive@example.test'),
        ('${cashierId}', 'cashier@example.test');

      INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
      VALUES
        ('${managerId}', 'manager@example.test', 'Manager', 'MANAGER', '${orgA}', TRUE),
        ('${ownerId}', 'owner@example.test', 'Owner', 'OWNER', '${orgA}', TRUE),
        ('${inactiveId}', 'inactive@example.test', 'Inactive', 'MANAGER', '${orgA}', TRUE),
        ('${cashierId}', 'cashier@example.test', 'Cashier', 'CASHIER', '${orgA}', TRUE);

      INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
      VALUES
        ('${orgA}', '${managerId}', 'MANAGER', TRUE),
        ('${orgA}', '${ownerId}', 'OWNER', TRUE),
        ('${orgA}', '${inactiveId}', 'MANAGER', FALSE),
        ('${orgA}', '${cashierId}', 'CASHIER', TRUE);

      INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
      VALUES
        ('${inactiveId}', '${orgA}', 'Inactive', 'inactive@example.test', 'MANAGER'),
        ('${cashierId}', '${orgA}', 'Cashier', 'cashier@example.test', 'CASHIER');

      INSERT INTO public.payment_accounts (id, organization_id, is_active)
      VALUES ('${accountA}', '${orgA}', TRUE);
      INSERT INTO public.categories (id, organization_id, name)
      VALUES ('${categoryA}', '${orgA}', 'Supplies');
    `);

    await db.exec(migration);
  });

  afterAll(async () => db.close());

  it("allows managers to read their shop but limits organization updates to owners", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);

    expect((await db.query("SELECT id FROM public.organizations WHERE id = $1", [orgA])).rows)
      .toHaveLength(1);

    const managerUpdate = await db.query(
      "UPDATE public.organizations SET name = 'Manager Attempt' WHERE id = $1",
      [orgA],
    );
    expect(managerUpdate.rowCount).toBe(0);

    await db.exec("RESET ROLE");
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${ownerId}', false);
      SET ROLE authenticated;
    `);
    const ownerUpdate = await db.query(
      "UPDATE public.organizations SET name = 'Owner Update' WHERE id = $1",
      [orgA],
    );
    expect(ownerUpdate.rowCount).toBe(1);
  });

  it("does not reactivate an explicitly inactive organization membership during sign-in provisioning", async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${inactiveId}', false);
      SET ROLE authenticated;
    `);

    await db.query("SELECT public.ensure_my_profile()");

    const membership = await db.query(
      "SELECT is_active FROM public.organization_members WHERE organization_id = $1 AND user_id = $2",
      [orgA, inactiveId],
    );
    expect(membership.rows[0].is_active).toBe(false);

    expect((await db.query("SELECT public.get_auth_org_id() AS organization_id")).rows[0].organization_id)
      .toBeNull();
    expect((await db.query("SELECT public.is_active_shop_member() AS active")).rows[0].active)
      .toBe(false);
    expect((await db.query("SELECT id FROM public.organizations WHERE id = $1", [orgA])).rows)
      .toHaveLength(0);
  });

  it("does not allow cashiers to bypass MANAGE_INVENTORY through legacy category policies", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${cashierId}', false);
      SET ROLE authenticated;
    `);

    const update = await db.query(
      "UPDATE public.categories SET name = 'Cashier Attempt' WHERE id = $1",
      [categoryA],
    );
    expect(update.rowCount).toBe(0);

    await expect(db.query(
      "INSERT INTO public.categories (id, organization_id, name) VALUES ($1, $2, 'Cashier Attempt')",
      ["99999999-9999-4999-8999-999999999999", orgA],
    )).rejects.toThrow();

    await db.exec("RESET ROLE");
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);
    const managerInsert = await db.query(
      "INSERT INTO public.categories (id, organization_id, name) VALUES ($1, $2, 'Manager Category')",
      ["aaaaaaaa-9999-4999-8999-999999999999", orgA],
    );
    expect(managerInsert.rowCount).toBe(1);
  });

  it("removes anonymous draft-table privileges while retaining authenticated access", async () => {
    const grants = await db.query(`
      SELECT
        has_table_privilege('anon', 'public.transaction_drafts', 'SELECT') AS anon_select,
        has_table_privilege('anon', 'public.transaction_drafts', 'INSERT') AS anon_insert,
        has_table_privilege('anon', 'public.transaction_drafts', 'UPDATE') AS anon_update,
        has_table_privilege('authenticated', 'public.transaction_drafts', 'INSERT') AS authenticated_insert
    `);
    expect(grants.rows[0]).toEqual({
      anon_select: false,
      anon_insert: false,
      anon_update: false,
      authenticated_insert: true,
    });
  });

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
