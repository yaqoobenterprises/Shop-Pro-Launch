-- Migration: Allow Account Overdraft and Resilient Transaction Drafts
-- Fixes:
-- 1. Permits expenses to be recorded against accounts starting at balance 0 or negative balance (overdraft)
--    by removing the balance_paisa + delta_paisa >= 0 guard in private.apply_account_delta.
-- 2. Makes public.post_transaction_draft resilient: if draft.category_id does not exist for the shop,
--    it defaults to NULL rather than aborting the transaction.
-- 3. Drops redundant single-column foreign key constraints that cause PostgREST PGRST201 embedding errors.

CREATE OR REPLACE FUNCTION private.apply_account_delta(
  target_account_id UUID, target_org_id UUID, delta_paisa BIGINT,
  target_entry_type TEXT, target_date DATE, target_user_id UUID,
  target_transaction_id UUID DEFAULT NULL, target_transfer_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF delta_paisa = 0 THEN RETURN; END IF;
  UPDATE public.payment_accounts
  SET balance_paisa = balance_paisa + delta_paisa,
      current_balance = (balance_paisa + delta_paisa)::NUMERIC / 100
  WHERE id = target_account_id AND organization_id = target_org_id AND is_active
  RETURNING balance_paisa INTO new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account does not belong to this shop or is inactive';
  END IF;
  INSERT INTO public.account_ledger_entries (
    organization_id, account_id, transaction_id, transfer_id, entry_type,
    amount_paisa, balance_after_paisa, business_date, created_by
  ) VALUES (
    target_org_id, target_account_id, target_transaction_id, target_transfer_id,
    target_entry_type, delta_paisa, new_balance, target_date, target_user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION private.apply_account_delta(UUID, UUID, BIGINT, TEXT, DATE, UUID, UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.post_transaction_draft(
  draft_id UUID,
  selected_account_id UUID
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  draft public.transaction_drafts%ROWTYPE;
  posted_transaction public.transactions%ROWTYPE;
  current_user_id UUID := auth.uid();
  valid_category_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to post a transaction draft';
  END IF;

  SELECT * INTO draft
  FROM public.transaction_drafts
  WHERE id = draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft_id::TEXT;
    IF FOUND THEN
      RETURN posted_transaction;
    END IF;
    RAISE EXCEPTION 'Transaction draft was not found';
  END IF;

  IF NOT public.is_active_shop_member()
     OR draft.organization_id <> public.get_auth_org_id() THEN
    RAISE EXCEPTION 'Transaction draft does not belong to an active shop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE id = selected_account_id
      AND organization_id = draft.organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Selected account does not belong to this shop or is inactive';
  END IF;

  -- Validate category: If category exists for this shop, link it; otherwise gracefully fall back to NULL
  valid_category_id := NULL;
  IF draft.category_id IS NOT NULL THEN
    SELECT id INTO valid_category_id
    FROM public.categories
    WHERE id = draft.category_id AND organization_id = draft.organization_id;
  END IF;

  INSERT INTO public.transactions (
    organization_id, type, amount_paisa, category_id, account_id,
    adjustment_dir, business_date, device_entry_time, note, raw_text,
    status, idempotency_key, created_by, created_by_name
  ) VALUES (
    draft.organization_id, draft.type, draft.amount_paisa, valid_category_id,
    selected_account_id, draft.adjustment_dir, draft.business_date,
    draft.device_entry_time, draft.note, draft.raw_text, 'active',
    'draft-' || draft.id::TEXT, current_user_id, draft.created_by_name
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO posted_transaction;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft.id::TEXT
      AND organization_id = draft.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction draft could not be posted';
    END IF;
  END IF;

  DELETE FROM public.transaction_drafts WHERE id = draft.id;
  RETURN posted_transaction;
END;
$$;

-- Drop legacy duplicate single-column foreign keys to prevent PostgREST PGRST201 embedding collisions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_category_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_category_organization_fk'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_category_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_drafts_category_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_drafts_category_organization_fk'
  ) THEN
    ALTER TABLE public.transaction_drafts DROP CONSTRAINT transaction_drafts_category_id_fkey;
  END IF;
END $$;
