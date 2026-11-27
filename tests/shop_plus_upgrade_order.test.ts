// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "11000000-0000-4000-8000-000000000011";
const other = "11000000-0000-4000-8000-000000000012";
const chatId = "22000000-0000-4000-8000-000000000011";
const messageId = "33000000-0000-4000-8000-000000000011";
const secondChat = "22000000-0000-4000-8000-000000000012";
const db = new PGlite({ extensions: { uuid_ossp } });
let org = "";
let foreignOrg = "";
const migration = (name: string) => db.exec(readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"));
async function signIn(id: string) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("SET ROLE authenticated");
}
describe("isolated upgrade from deployed migration order", () => {
  beforeAll(async () => {
    await db.waitReady;
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"aal":"aal1"}'::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    for (const name of [
      "20261016094952_shop_pro_launch_baseline.sql",
      "20261016122204_enforce_mfa_for_enrolled_users.sql",
      "20261020055612_fix_mfa_factor_access_policy.sql",
      "20261020060229_fix_profiles_rls_recursion.sql",
      "20261116195744_ai_accountant_chat_sync.sql",
      "20261116195839_ai_accountant_chat_sync_indexes.sql",
    ]) await migration(name);
    await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'fixture-one@example.test'),($2,'fixture-two@example.test')",[owner,other]);
    const profiles = await db.query<{id:string;organization_id:string}>("SELECT id, organization_id FROM profiles WHERE id IN ($1,$2)",[owner,other]);
    org = profiles.rows.find(row=>row.id===owner)!.organization_id;
    foreignOrg = profiles.rows.find(row=>row.id===other)!.organization_id;
    expect(org).not.toBe(foreignOrg);
    await db.query("INSERT INTO ai_accountant_conversations(id,organization_id,user_id,title) VALUES ($1,$2,$3,'Existing chat')",[chatId,org,owner]);
    await db.query("INSERT INTO ai_accountant_messages(id,conversation_id,organization_id,user_id,role,content) VALUES ($1,$2,$3,$4,'user','Existing question')",[messageId,chatId,org,owner]);
    // Apply the two currently pending migrations to the populated fixture, not to production.
    await migration("20261017062800_launch_authorization_hardening.sql");
    await migration("20261117054753_ledgermate_multi_conversation_history.sql");
  }, 60000);
  afterAll(async () => db.close());
  it("preserves existing chat data and permits a second chat", async () => {
    await signIn(owner);
    expect((await db.query("SELECT id,content FROM ai_accountant_messages WHERE id=$1",[messageId])).rows).toEqual([{id:messageId,content:"Existing question"}]);
    await db.query("INSERT INTO ai_accountant_conversations(id,organization_id,user_id,title) VALUES ($1,$2,$3,'Second chat')",[secondChat,org,owner]);
    expect((await db.query("SELECT id FROM ai_accountant_conversations")).rows).toHaveLength(2);
  });
  it("preserves chat isolation for a different shop and user", async () => {
    await signIn(other);
    expect((await db.query("SELECT id FROM ai_accountant_conversations WHERE organization_id=$1",[org])).rows).toEqual([]);
    expect((await db.query("SELECT id FROM ai_accountant_messages WHERE conversation_id=$1",[chatId])).rows).toEqual([]);
    expect((await db.query("DELETE FROM ai_accountant_messages WHERE id=$1 RETURNING id",[messageId])).rows).toEqual([]);
    await expect(db.query("INSERT INTO ai_accountant_messages(conversation_id,organization_id,user_id,role,content) VALUES ($1,$2,$3,'user','Synthetic forbidden message')",[chatId,org,other])).rejects.toThrow();
  });
  it("keeps owner-only organization updates and existing scoped records", async () => {
    await signIn(owner);
    expect((await db.query("UPDATE organizations SET name='Fixture renamed' WHERE id=$1 RETURNING id",[org])).rows).toEqual([{id:org}]);
    expect((await db.query("UPDATE organizations SET name='Not permitted' WHERE id=$1 RETURNING id",[foreignOrg])).rows).toEqual([]);
    expect((await db.query("SELECT id FROM organizations WHERE id=$1",[foreignOrg])).rows).toEqual([]);
  });
  it("preserves the original saved response when appending a new answer", async () => {
    await signIn(owner);
    await db.query("INSERT INTO ai_accountant_messages(conversation_id,organization_id,user_id,role,content) VALUES ($1,$2,$3,'assistant','Revised answer')",[chatId,org,owner]);
    expect((await db.query("SELECT content FROM ai_accountant_messages WHERE conversation_id=$1 ORDER BY content",[chatId])).rows).toEqual([{content:"Existing question"},{content:"Revised answer"}]);
  });
});
