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

const ownerId = "11111111-1111-1111-1111-111111111111";
const managerId = "22222222-2222-2222-2222-222222222222";
const inactiveMemberId = "33333333-3333-3333-3333-333333333333";
const otherOwnerId = "44444444-4444-4444-4444-444444444444";
const organizationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherOrganizationId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const foreignDraftId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("launch authorization hardening migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      GRANT USAGE ON SCHEMA auth, private TO authenticated;

      CREATE TABLE auth.users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::JSONB
      );
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      CREATE TABLE public.organizations (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        currency TEXT NOT NULL,
        currency_symbol TEXT NOT NULL
      );
      CREATE TABLE public.organization_members (
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN NOT NULL,
        UNIQUE (organization_id, user_id)
      );
      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        organization_id UUID,
        is_active BOOLEAN NOT NULL
      );
      CREATE TABLE public.shop_members (
        user_id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL
      );
      CREATE FUNCTION public.seed_shop_defaults(UUID) RETURNS VOID
      LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;

      CREATE TABLE public.payment_accounts (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        is_active BOOLEAN NOT NULL
      );
      CREATE TABLE public.categories (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL
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
        raw_text TEXT,
        created_by_name TEXT NOT NULL
      );
      CREATE TABLE public.transactions (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        type TEXT NOT NULL,
        amount_paisa BIGINT NOT NULL,
        category_id UUID,
        account_id UUID,
        adjustment_dir TEXT,
        business_date DATE NOT NULL,
        device_entry_time TIMESTAMPTZ NOT NULL,
        note TEXT,
        raw_text TEXT,
        status TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        created_by UUID NOT NULL,
        created_by_name TEXT NOT NULL
      );

      ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE ON public.organizations TO authenticated;
      CREATE POLICY organizations_update ON public.organizations
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

      INSERT INTO public.organizations VALUES
        ('${organizationId}', 'Shop A', 'Owner A', 'PKR', 'Rs.'),
        ('${otherOrganizationId}', 'Shop B', 'Owner B', 'PKR', 'Rs.');
      INSERT INTO public.organization_members VALUES
        ('${organizationId}', '${ownerId}', 'OWNER', TRUE),
        ('${organizationId}', '${managerId}', 'MANAGER', TRUE),
        ('${organizationId}', '${inactiveMemberId}', 'CASHIER', FALSE),
        ('${otherOrganizationId}', '${otherOwnerId}', 'OWNER', TRUE);
      INSERT INTO public.profiles VALUES
        ('${ownerId}', 'owner@example.test', 'Owner', 'OWNER', '${organizationId}', TRUE),
        ('${managerId}', 'manager@example.test', 'Manager', 'MANAGER', '${organizationId}', TRUE),
        ('${inactiveMemberId}', 'inactive@example.test', 'Inactive', 'CASHIER', '${organizationId}', TRUE),
        ('${otherOwnerId}', 'other@example.test', 'Other Owner', 'OWNER', '${otherOrganizationId}', TRUE);
      INSERT INTO public.shop_members VALUES
        ('${ownerId}', '${organizationId}', 'Owner', 'owner@example.test', 'OWNER'),
        ('${managerId}', '${organizationId}', 'Manager', 'manager@example.test', 'MANAGER'),
        ('${otherOwnerId}', '${otherOrganizationId}', 'Other Owner', 'other@example.test', 'OWNER');
      INSERT INTO auth.users (id, email) VALUES
        ('${ownerId}', 'owner@example.test'),
        ('${managerId}', 'manager@example.test'),
        ('${inactiveMemberId}', 'inactive@example.test'),
        ('${otherOwnerId}', 'other@example.test');

      INSERT INTO public.transaction_drafts VALUES (
        '${foreignDraftId}', '${otherOrganizationId}', 'income', 120000, NULL, NULL,
        '2026-11-05', now(), 'foreign draft', 'foreign draft', 'Other Owner'
      );
      INSERT INTO public.transactions VALUES (
        'dddddddd-dddd-dddd-dddd-dddddddddddd', '${otherOrganizationId}', 'income', 120000,
        NULL, NULL, NULL, '2026-11-05', now(), 'foreign transaction', 'foreign transaction',
        'active', 'draft-${foreignDraftId}', '${otherOwnerId}', 'Other Owner'
      );
    `);

    await db.exec(migration);
  });

  afterAll(async () => db.close());

  it("limits organization updates to active owners in that organization", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${ownerId}', false);
      SET ROLE authenticated;
    `);
    expect((await db.query(`UPDATE public.organizations SET name = 'Renamed' WHERE id = '${organizationId}'`)).rowCount).toBe(1);

    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);
    expect((await db.query(`UPDATE public.organizations SET name = 'Manager Rename' WHERE id = '${organizationId}'`)).rowCount).toBe(0);

    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${otherOwnerId}', false);
      SET ROLE authenticated;
    `);
    expect((await db.query(`UPDATE public.organizations SET name = 'Cross-Shop Rename' WHERE id = '${organizationId}'`)).rowCount).toBe(0);
    await db.exec("RESET ROLE");

    const org = await db.query("SELECT name FROM public.organizations WHERE id = $1", [organizationId]);
    expect(org.rows[0].name).toBe("Renamed");
  });

  it("does not return another shop's idempotent transaction on a draft retry", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${managerId}', false);
      SET ROLE authenticated;
    `);
    await expect(
      db.query("SELECT public.post_transaction_draft($1, $2)", [foreignDraftId, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"]),
    ).rejects.toThrow("Transaction draft was not found");
    await db.exec("RESET ROLE");
  });

  it("keeps a deactivated organization membership inactive during profile sync", async () => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${inactiveMemberId}', false);
      SET ROLE authenticated;
      SELECT public.ensure_my_profile();
      RESET ROLE;
    `);
    const membership = await db.query(
      "SELECT is_active FROM public.organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, inactiveMemberId],
    );
    expect(membership.rows[0].is_active).toBe(false);
  });

  it("does not expose transaction drafts to anonymous roles", async () => {
    const privileges = await db.query(`
      SELECT has_table_privilege('anon', 'public.transaction_drafts', 'INSERT,UPDATE') AS anon_can_write
    `);
    expect(privileges.rows[0].anon_can_write).toBe(false);
  });
});
