-- Reversals append an equal and opposite journal; source history remains intact.
CREATE FUNCTION public.reverse_aqvora_journal(
  organization_id uuid, original_journal_id uuid, intent_key text,
  business_date date, reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE original record; inverse_lines jsonb;
BEGIN
  PERFORM private.aqvora_authorize(organization_id);
  IF reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Reversal reason is required';
  END IF;
  SELECT id, reversal_of INTO original FROM public.aqvora_journals
    WHERE aqvora_journals.organization_id = reverse_aqvora_journal.organization_id
      AND id = original_journal_id FOR SHARE;
  IF NOT FOUND OR original.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'Original journal is missing or is itself a reversal';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'account_id', account_id,
    'debit_minor', credit_minor::text,
    'credit_minor', debit_minor::text,
    'party_id', party_id,
    'open_item_id', open_item_id,
    'stock_movement_id', stock_movement_id
  ) ORDER BY line_no) INTO inverse_lines
    FROM public.aqvora_journal_lines
    WHERE aqvora_journal_lines.organization_id = reverse_aqvora_journal.organization_id
      AND journal_id = original_journal_id;
  IF inverse_lines IS NULL THEN RAISE EXCEPTION 'Original journal has no lines'; END IF;
  RETURN private.aqvora_post_internal(
    organization_id, intent_key, business_date, inverse_lines,
    original_journal_id, reason);
END $$;
REVOKE ALL ON FUNCTION public.reverse_aqvora_journal(uuid,uuid,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_aqvora_journal(uuid,uuid,text,date,text) TO authenticated;
