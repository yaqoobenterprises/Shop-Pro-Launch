-- Persistent, per-user AI Accountant chat history.
-- Row access is restricted to the authenticated user and their active organization.

create table public.ai_accountant_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'AI Accountant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_accountant_conversations_org_user_unique unique (organization_id, user_id),
  constraint ai_accountant_conversations_identity_unique unique (id, organization_id, user_id)
);

create table public.ai_accountant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now(),
  constraint ai_accountant_messages_conversation_owner_fk
    foreign key (conversation_id, organization_id, user_id)
    references public.ai_accountant_conversations(id, organization_id, user_id)
    on delete cascade
);

create index ai_accountant_messages_conversation_created_idx
  on public.ai_accountant_messages (conversation_id, created_at desc);

alter table public.ai_accountant_conversations enable row level security;
alter table public.ai_accountant_messages enable row level security;

grant select, insert, update on public.ai_accountant_conversations to authenticated;
grant select, insert, delete on public.ai_accountant_messages to authenticated;

create policy "ai_accountant_conversations_select_own"
  on public.ai_accountant_conversations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );

create policy "ai_accountant_conversations_insert_own"
  on public.ai_accountant_conversations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );

create policy "ai_accountant_conversations_update_own"
  on public.ai_accountant_conversations
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  )
  with check (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );

create policy "ai_accountant_messages_select_own"
  on public.ai_accountant_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );

create policy "ai_accountant_messages_insert_own"
  on public.ai_accountant_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );

create policy "ai_accountant_messages_delete_own"
  on public.ai_accountant_messages
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select org_id from private.get_auth_user_org_ids())
  );
