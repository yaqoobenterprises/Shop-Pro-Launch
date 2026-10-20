// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readMigration = (name: string) => readFileSync(path.join(root, "supabase/migrations", name), "utf8");
const userId = "11111111-1111-1111-1111-111111111111";
const otherOrganizationId = "22222222-2222-2222-2222-222222222222";

describe("current Supabase security migrations", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT USAGE ON SCHEMA private TO authenticated;

      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;
      CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE SQL STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
      $$;

      CREATE TABLE auth.mfa_factors (user_id UUID NOT NULL, status TEXT NOT NULL);
      CREATE TABLE public.mfa_probe (id INTEGER PRIMARY KEY);
      ALTER TABLE public.mfa_probe ENABLE ROW LEVEL SECURITY;
      CREATE POLICY require_aal2_for_enrolled_mfa ON public.mfa_probe
        AS RESTRICTIVE FOR ALL TO authenticated
        USING ((SELECT (auth.jwt() ->> 'aal') = 'aal2'))
        WITH CHECK ((SELECT (auth.jwt() ->> 'aal') = 'aal2'));
      CREATE POLICY mfa_probe_read ON public.mfa_probe
        FOR SELECT TO authenticated USING (true);
      GRANT SELECT ON public.mfa_probe TO authenticated;
      INSERT INTO public.mfa_probe VALUES (1);

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        organization_id UUID,
        role TEXT NOT NULL,
        full_name TEXT NOT NULL
      );
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY profiles_select_self ON public.profiles
        FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
      CREATE POLICY profiles_update_self ON public.profiles
        FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (true);
      GRANT SELECT, UPDATE ON public.profiles TO authenticated;
      INSERT INTO public.profiles VALUES ('${userId}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OWNER', 'Before');
    `);

    await db.exec(readMigration("20261020055612_fix_mfa_factor_access_policy.sql"));
    await db.exec(readMigration("20261020060229_fix_profiles_rls_recursion.sql"));
  });

  afterAll(async () => db.close());

  it("restricts the MFA helper and enforces AAL2 only for enrolled users", async () => {
    const privileges = await db.query(`
      SELECT
        has_function_privilege('anon', 'private.current_user_meets_mfa_requirement()', 'EXECUTE') AS anon_can_execute,
        has_function_privilege('authenticated', 'private.current_user_meets_mfa_requirement()', 'EXECUTE') AS authenticated_can_execute
    `);
    expect(privileges.rows[0]).toEqual({ anon_can_execute: false, authenticated_can_execute: true });

    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claims', '{"aal":"aal1"}', false);
      SET ROLE authenticated;
    `);
    expect((await db.query("SELECT private.current_user_meets_mfa_requirement() AS allowed")).rows[0].allowed).toBe(true);
    expect((await db.query("SELECT * FROM public.mfa_probe")).rows).toHaveLength(1);

    await db.exec(`RESET ROLE; INSERT INTO auth.mfa_factors VALUES ('${userId}', 'verified'); SET ROLE authenticated;`);
    expect((await db.query("SELECT private.current_user_meets_mfa_requirement() AS allowed")).rows[0].allowed).toBe(false);
    expect((await db.query("SELECT * FROM public.mfa_probe")).rows).toHaveLength(0);

    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '{"aal":"aal2"}', false); SET ROLE authenticated;`);
    expect((await db.query("SELECT private.current_user_meets_mfa_requirement() AS allowed")).rows[0].allowed).toBe(true);
    expect((await db.query("SELECT * FROM public.mfa_probe")).rows).toHaveLength(1);
  });

  it("allows profile edits while preserving the current user's organization and role", async () => {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SET ROLE authenticated;
    `);
    const update = await db.query(`UPDATE public.profiles SET full_name = 'After' WHERE id = '${userId}'`);
    expect(update.rowCount).toBe(1);

    await expect(db.query(`UPDATE public.profiles SET role = 'ADMIN' WHERE id = '${userId}'`)).rejects.toThrow();
    await expect(db.query(`UPDATE public.profiles SET organization_id = '${otherOrganizationId}' WHERE id = '${userId}'`)).rejects.toThrow();

    await db.exec("RESET ROLE");
    const profile = await db.query("SELECT organization_id, role, full_name FROM public.profiles WHERE id = $1", [userId]);
    expect(profile.rows[0]).toEqual({
      organization_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      role: "OWNER",
      full_name: "After",
    });
  });
});
