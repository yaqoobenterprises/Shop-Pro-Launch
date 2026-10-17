// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('Regional Settings Database & Trigger Tests (PGlite)', () => {
  let pg: PGlite;

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const managerId = '55555555-5555-4555-8555-555555555555';
  const cashierId = '22222222-2222-4222-8222-222222222222';
  const strangerId = '33333333-3333-4333-8333-333333333333';
  const kiritimatiOwnerId = '44444444-4444-4444-8444-444444444444';

  const karachiOrgId = '00000000-0000-0000-0000-000000000001';
  const laOrgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const kiritimatiOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  let karachiAccountId = '';
  let laAccountId = '';
  let kiritimatiAccountId = '';

  const setAuthContext = async (userId: string | null, role: 'authenticated' | 'anon' = 'authenticated') => {
    await pg.exec(`
      RESET ROLE;
      SET "request.jwt.claim.sub" = '${userId || ''}';
      SET "request.jwt.claim.role" = '${role}';
      SET ROLE ${role};
    `);
  };

  beforeAll(async () => {
    pg = new PGlite();

    // 1. Auth schema stub
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS private;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      DO $$ BEGIN
        CREATE ROLE anon;
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE ROLE authenticated;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT USAGE ON SCHEMA public TO authenticated;
    `);

    // 2. Load foundation migrations
    const foundationPath = path.resolve(__dirname, '../supabase/migration-history/20261004000000_shop_ledger_foundation.sql');
    await pg.exec(fs.readFileSync(foundationPath, 'utf8'));

    await pg.exec(`
      CREATE TABLE IF NOT EXISTS public.payment_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      GRANT SELECT, INSERT, UPDATE ON public.payment_accounts TO authenticated;

      CREATE TABLE IF NOT EXISTS public.account_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        from_account_id UUID NOT NULL,
        to_account_id UUID NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        date DATE NOT NULL,
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      GRANT SELECT, INSERT, UPDATE ON public.account_transfers TO authenticated;
    `);

    const accountPostingPath = path.resolve(__dirname, '../supabase/migration-history/20261004003000_account_balances_and_postings.sql');
    await pg.exec(fs.readFileSync(accountPostingPath, 'utf8'));

    // Create the baseline policy so the proposal replaces it in this local test.
    await pg.exec(`
      GRANT USAGE ON SCHEMA private TO authenticated;
      GRANT UPDATE ON public.organizations TO authenticated;
      CREATE POLICY organizations_update ON public.organizations
        FOR UPDATE TO authenticated
        USING (id IN (SELECT organization_id FROM public.shop_members WHERE user_id = auth.uid()))
        WITH CHECK (id IN (SELECT organization_id FROM public.shop_members WHERE user_id = auth.uid()));
    `);

    // 3. Load regional settings migration
    const regionalPath = path.resolve(__dirname, '../supabase/migration-history/20261014000000_regional_settings.sql');
    await pg.exec(fs.readFileSync(regionalPath, 'utf8'));

    // Apply the proposal locally to verify the owner-only organization policy.
    const ownerUpdatePath = path.resolve(
      __dirname,
      '../supabase/migration-history/proposals/20261016074319_owner_only_organization_updates.sql',
    );
    await pg.exec(fs.readFileSync(ownerUpdatePath, 'utf8'));

    // 4. Seed users in auth.users
    await pg.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${ownerId}', 'owner@shop.com'),
        ('${managerId}', 'manager@shop.com'),
        ('${cashierId}', 'cashier@shop.com'),
        ('${strangerId}', 'stranger@other.com'),
        ('${kiritimatiOwnerId}', 'kiritimati@shop.com');
    `);

    // 5. Seed organizations with different timezones
    await pg.exec(`
      INSERT INTO public.organizations (id, name, currency, timezone, country, region_configured)
      VALUES
        ('${karachiOrgId}', 'Karachi Shop', 'PKR', 'Asia/Karachi', 'Pakistan', true),
        ('${laOrgId}', 'LA Store', 'USD', 'America/Los_Angeles', 'United States', true),
        ('${kiritimatiOrgId}', 'Line Islands Trading', 'AUD', 'Pacific/Kiritimati', 'Kiribati', true)
      ON CONFLICT (id) DO UPDATE SET
        timezone = EXCLUDED.timezone,
        currency = EXCLUDED.currency,
        region_configured = EXCLUDED.region_configured;

      -- Seed members
      INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
      VALUES
        ('${ownerId}', '${karachiOrgId}', 'Shop Owner', 'owner@shop.com', 'OWNER'),
        ('${managerId}', '${karachiOrgId}', 'Shop Manager', 'manager@shop.com', 'MANAGER'),
        ('${cashierId}', '${karachiOrgId}', 'Cashier Brother', 'cashier@shop.com', 'CASHIER'),
        ('${strangerId}', '${laOrgId}', 'LA Owner', 'stranger@other.com', 'OWNER'),
        ('${kiritimatiOwnerId}', '${kiritimatiOrgId}', 'Kiribati Owner', 'kiritimati@shop.com', 'OWNER')
      ON CONFLICT (user_id) DO NOTHING;

      -- Seed payment accounts
      INSERT INTO public.payment_accounts (id, organization_id, name, type, is_default, is_active)
      VALUES
        ('10000000-0000-0000-0000-000000000001', '${karachiOrgId}', 'Cash Drawer', 'cash', true, true),
        ('20000000-0000-0000-0000-000000000002', '${laOrgId}', 'LA Cash', 'cash', true, true),
        ('30000000-0000-0000-0000-000000000003', '${kiritimatiOrgId}', 'Island Cash', 'cash', true, true);
    `);

    karachiAccountId = '10000000-0000-0000-0000-000000000001';
    laAccountId = '20000000-0000-0000-0000-000000000002';
    kiritimatiAccountId = '30000000-0000-0000-0000-000000000003';
  });

  describe('Timezone-Aware Business Date Trigger (Asia/Karachi, America/Los_Angeles, Pacific/Kiritimati)', () => {
    it('populates business_date matching the organization timezone when NULL is supplied', async () => {
      await setAuthContext(ownerId);

      // Karachi insert
      const resKarachi = await pg.query<{ business_date: string }>(`
        INSERT INTO public.transactions (
          organization_id, account_id, type, amount_paisa, raw_text, created_by, created_by_name, idempotency_key
        ) VALUES (
          '${karachiOrgId}', '${karachiAccountId}', 'income', 10000, 'TEST KARACHI', '${ownerId}', 'Shop Owner', 'tx-test-karachi-1'
        ) RETURNING business_date::TEXT AS business_date;
      `);
      const karachiDate = resKarachi.rows[0].business_date;
      const expectedKarachi = (await pg.query<{ d: string }>(
        `SELECT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE::TEXT AS d;`
      )).rows[0].d;
      expect(karachiDate).toBe(expectedKarachi);

      // LA insert
      await setAuthContext(strangerId);
      const resLA = await pg.query<{ business_date: string }>(`
        INSERT INTO public.transactions (
          organization_id, account_id, type, amount_paisa, raw_text, created_by, created_by_name, idempotency_key
        ) VALUES (
          '${laOrgId}', '${laAccountId}', 'income', 10000, 'TEST LA', '${strangerId}', 'LA Owner', 'tx-test-la-1'
        ) RETURNING business_date::TEXT AS business_date;
      `);
      const laDate = resLA.rows[0].business_date;
      const expectedLA = (await pg.query<{ d: string }>(
        `SELECT (NOW() AT TIME ZONE 'America/Los_Angeles')::DATE::TEXT AS d;`
      )).rows[0].d;
      expect(laDate).toBe(expectedLA);

      // Kiritimati insert (UTC+14)
      await setAuthContext(kiritimatiOwnerId);
      const resKiritimati = await pg.query<{ business_date: string }>(`
        INSERT INTO public.transactions (
          organization_id, account_id, type, amount_paisa, raw_text, created_by, created_by_name, idempotency_key
        ) VALUES (
          '${kiritimatiOrgId}', '${kiritimatiAccountId}', 'income', 10000, 'TEST KIRITIMATI', '${kiritimatiOwnerId}', 'Kiritimati', 'tx-test-kiritimati-1'
        ) RETURNING business_date::TEXT AS business_date;
      `);
      const kiritimatiDate = resKiritimati.rows[0].business_date;
      const expectedKiritimati = (await pg.query<{ d: string }>(
        `SELECT (NOW() AT TIME ZONE 'Pacific/Kiritimati')::DATE::TEXT AS d;`
      )).rows[0].d;
      expect(kiritimatiDate).toBe(expectedKiritimati);
    });

    it('rejects future business dates according to shop timezone', async () => {
      await setAuthContext(ownerId);
      const farFuture = '2099-01-01';
      await expect(
        pg.query(`
          INSERT INTO public.transactions (
            organization_id, account_id, type, amount_paisa, business_date, raw_text, created_by, created_by_name, idempotency_key
          ) VALUES (
            '${karachiOrgId}', '${karachiAccountId}', 'income', 10000, '${farFuture}', 'FUTURE TEST', '${ownerId}', 'Shop Owner', 'tx-future-test'
          );
        `)
      ).rejects.toThrow(/Future business dates are prohibited/);
    });
  });

  describe('Organization Regional Settings Guard Trigger', () => {
    it('blocks a non-OWNER from changing regional settings through the organization policy', async () => {
      await setAuthContext(cashierId);

      const result = await pg.query(`
        UPDATE public.organizations
        SET timezone = 'UTC'
        WHERE id = '${karachiOrgId}'
        RETURNING id;
      `);
      expect(result.rows).toHaveLength(0);
    });

    it('allows OWNER to update country and timezone on their shop when valid', async () => {
      await setAuthContext(ownerId); // OWNER role
      await expect(
        pg.query(`
          UPDATE public.organizations
          SET country = 'Islamic Republic of Pakistan'
          WHERE id = '${karachiOrgId}';
        `)
      ).resolves.toBeDefined();
    });

    it('locks currency once transactions exist for the organization', async () => {
      await setAuthContext(ownerId);
      // Transactions already exist from previous test for karachiOrgId
      await expect(
        pg.query(`
          UPDATE public.organizations
          SET currency = 'EUR'
          WHERE id = '${karachiOrgId}';
        `)
      ).rejects.toThrow(/currency is locked once entries exist/);
    });
  });

  describe('Owner-only Organization Updates RLS Policy', () => {
    it('allows an OWNER to update a non-regional organization field', async () => {
      await setAuthContext(ownerId);

      const result = await pg.query(`
        UPDATE public.organizations
        SET name = 'Karachi Shop Updated'
        WHERE id = '${karachiOrgId}'
        RETURNING id;
      `);

      expect(result.rows).toHaveLength(1);
    });

    it.each([
      ['MANAGER', managerId],
      ['CASHIER', cashierId],
    ])('denies %s from updating organization settings', async (_role, userId) => {
      await setAuthContext(userId);

      const result = await pg.query(`
        UPDATE public.organizations
        SET name = 'Unauthorized Update'
        WHERE id = '${karachiOrgId}'
        RETURNING id;
      `);

      expect(result.rows).toHaveLength(0);
    });

    it('denies an OWNER from another organization and prevents changing organization id', async () => {
      await setAuthContext(strangerId);
      const crossOrganizationUpdate = await pg.query(`
        UPDATE public.organizations
        SET name = 'Unauthorized Cross-Shop Update'
        WHERE id = '${karachiOrgId}'
        RETURNING id;
      `);
      expect(crossOrganizationUpdate.rows).toHaveLength(0);

      await setAuthContext(ownerId);
      await expect(pg.query(`
        UPDATE public.organizations
        SET id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        WHERE id = '${karachiOrgId}';
      `)).rejects.toThrow(/row-level security policy/);
    });
  });

  describe('User Preferences Isolation with Row-Level Security', () => {
    it('allows users to insert and select their own preferences with strict isolation', async () => {
      // User 1 (Owner) sets preferences
      await setAuthContext(ownerId);
      await pg.exec(`
        INSERT INTO public.user_preferences (user_id, organization_id, entry_mode, language)
        VALUES ('${ownerId}', '${karachiOrgId}', 'both', 'ur')
        ON CONFLICT (user_id) DO UPDATE SET entry_mode = 'both', language = 'ur';
      `);

      const ownerRows = await pg.query<{ entry_mode: string; language: string }>(`
        SELECT entry_mode, language FROM public.user_preferences;
      `);
      expect(ownerRows.rows).toHaveLength(1);
      expect(ownerRows.rows[0]).toEqual({ entry_mode: 'both', language: 'ur' });

      // User 2 (Cashier) sets preferences
      await setAuthContext(cashierId);
      await pg.exec(`
        INSERT INTO public.user_preferences (user_id, organization_id, entry_mode, language)
        VALUES ('${cashierId}', '${karachiOrgId}', 'standard', 'en')
        ON CONFLICT (user_id) DO UPDATE SET entry_mode = 'standard', language = 'en';
      `);

      const cashierRows = await pg.query<{ entry_mode: string; language: string }>(`
        SELECT entry_mode, language FROM public.user_preferences;
      `);
      expect(cashierRows.rows).toHaveLength(1);
      expect(cashierRows.rows[0]).toEqual({ entry_mode: 'standard', language: 'en' });

      // Cashier cannot see or alter Owner's preferences
      const crossCheck = await pg.query(`
        SELECT * FROM public.user_preferences WHERE user_id = '${ownerId}';
      `);
      expect(crossCheck.rows).toHaveLength(0);
    });
  });
});
