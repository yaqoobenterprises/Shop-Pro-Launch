-- Allow each authorized organization member to keep multiple LedgerMate conversations.
-- Existing conversation and message rows, grants, and RLS policies remain unchanged.
alter table public.ai_accountant_conversations
  drop constraint if exists ai_accountant_conversations_org_user_unique;

create index if not exists ai_accountant_conversations_owner_updated_idx
  on public.ai_accountant_conversations (organization_id, user_id, updated_at desc);
