// Shared isolated database fixture for authorization migration tests.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261017062800_launch_authorization_hardening.sql"),
  "utf8",
);

export const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const managerId = "11111111-1111-4111-8111-111111111111";
export const ownerId = "22222222-2222-4222-8222-222222222222";
export const inactiveId = "33333333-3333-4333-8333-333333333333";
export const cashierId = "88888888-8888-4888-8888-888888888888";
export const accountA = "44444444-4444-4444-8444-444444444444";
export const categoryA = "55555555-5555-4555-8555-555555555555";
export const draftA = "66666666-6666-4666-8666-666666666666";
export const crossShopDraft = "77777777-7777-4777-8777-777777777777";

export async function createAuthorizationHardeningDb(): Promise<PGlite> {
  const db = new PGlite();
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
  return db;
}
