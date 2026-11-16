-- Indexes for the per-user AI Accountant chat history access paths and foreign keys.
create index if not exists ai_accountant_conversations_user_id_idx
  on public.ai_accountant_conversations (user_id);

create index if not exists ai_accountant_messages_org_id_idx
  on public.ai_accountant_messages (organization_id);

create index if not exists ai_accountant_messages_user_id_idx
  on public.ai_accountant_messages (user_id);

create index if not exists ai_accountant_messages_conversation_scope_created_idx
  on public.ai_accountant_messages (conversation_id, organization_id, user_id, created_at asc);
