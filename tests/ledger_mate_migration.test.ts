// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/20261117054753_ledgermate_multi_conversation_history.sql"), "utf8");
const orgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const conversationId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("LedgerMate multiple-conversation migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE public.ai_accountant_conversations (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        title TEXT NOT NULL DEFAULT 'AI Accountant',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ai_accountant_conversations_org_user_unique UNIQUE (organization_id, user_id),
        CONSTRAINT ai_accountant_conversations_identity_unique UNIQUE (id, organization_id, user_id)
      );
      CREATE TABLE public.ai_accountant_messages (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        CONSTRAINT ai_accountant_messages_conversation_owner_fk
          FOREIGN KEY (conversation_id, organization_id, user_id)
          REFERENCES public.ai_accountant_conversations(id, organization_id, user_id)
      );
      ALTER TABLE public.ai_accountant_conversations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ai_accountant_conversations_select_own
        ON public.ai_accountant_conversations FOR SELECT USING (user_id = '${userId}');
      INSERT INTO public.ai_accountant_conversations (id, organization_id, user_id, title)
      VALUES ('${conversationId}', '${orgId}', '${userId}', 'Saved chat');
      INSERT INTO public.ai_accountant_messages (id, conversation_id, organization_id, user_id, content)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '${conversationId}', '${orgId}', '${userId}', 'Saved message');
    `);
    await db.exec(migration);
  });

  afterAll(async () => db.close());

  it("keeps existing conversations, messages, owner identity and RLS intact", async () => {
    const savedRows = await db.query(`
      SELECT c.title, m.content, pg_class.relrowsecurity
      FROM public.ai_accountant_conversations AS c
      JOIN public.ai_accountant_messages AS m ON m.conversation_id = c.id
      JOIN pg_class ON pg_class.relname = 'ai_accountant_conversations'
      WHERE c.id = $1
    `, [conversationId]);
    expect(savedRows.rows).toHaveLength(1);
    expect(savedRows.rows[0]).toMatchObject({ title: "Saved chat", content: "Saved message", relrowsecurity: true });

    const policies = await db.query(`
      SELECT policyname FROM pg_policies WHERE tablename = 'ai_accountant_conversations'
    `);
    expect(policies.rows.map((row) => row.policyname)).toEqual(["ai_accountant_conversations_select_own"]);
    const identityConstraint = await db.query(`
      SELECT conname FROM pg_constraint WHERE conrelid = 'public.ai_accountant_conversations'::regclass
    `);
    expect(identityConstraint.rows.map((row) => row.conname)).toContain("ai_accountant_conversations_identity_unique");
  });

  it("allows a second chat for the same organization member while preserving message ownership", async () => {
    const secondId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    await db.query(`
      INSERT INTO public.ai_accountant_conversations (id, organization_id, user_id, title)
      VALUES ($1, $2, $3, 'Second chat')
    `, [secondId, orgId, userId]);
    const messageInsert = db.query(`
      INSERT INTO public.ai_accountant_messages (id, conversation_id, organization_id, user_id, content)
      VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', $1, $2, $3, 'Message')
    `, [secondId, orgId, userId]);
    await expect(messageInsert).resolves.toMatchObject({ rowCount: 1 });
    const count = await db.query(`SELECT count(*)::integer AS chats FROM public.ai_accountant_conversations WHERE organization_id = $1 AND user_id = $2`, [orgId, userId]);
    expect(count.rows[0].chats).toBe(2);
  });
});
