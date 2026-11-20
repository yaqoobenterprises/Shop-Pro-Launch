// @vitest-environment node
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { expect, it } from "vitest";

it("installs V2 after the full repository migration chain in isolated PostgreSQL", async () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal', true)) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    const migrationRoot = new URL("../supabase/migrations/", import.meta.url);
    const files = readdirSync(migrationRoot).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      await db.exec(readFileSync(new URL(file, migrationRoot), "utf8"));
    }
    const names = await db.query<{ name: string }>(`
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname='public' AND tablename LIKE 'aqvora_%' ORDER BY tablename
    `);
    expect(names.rows.map((row) => row.name)).toContain("aqvora_posting_receipts");
    const enrollment = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.aqvora_enabled_companies");
    expect(enrollment.rows[0].n).toBe(0);
    const grants = await db.query<{ can_insert: boolean; can_execute: boolean }>(`
      SELECT has_table_privilege('authenticated','public.aqvora_journals','INSERT') AS can_insert,
             has_function_privilege('anon','public.post_aqvora_journal(uuid,text,date,jsonb)','EXECUTE') AS can_execute
    `);
    expect(grants.rows[0]).toEqual({ can_insert: false, can_execute: false });
  } finally {
    await db.close();
  }
});
