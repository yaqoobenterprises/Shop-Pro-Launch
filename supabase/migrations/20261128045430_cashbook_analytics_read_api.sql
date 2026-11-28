-- Preview preparation only. Apply after owner review and authorization regression checks.
-- Reads existing cashbook fields only; no new accounting records or changed calculations.
CREATE OR REPLACE FUNCTION public.cashbook_period_analytics(
  target_org UUID, start_date DATE, end_date DATE,
  filter_type TEXT DEFAULT 'all', filter_category UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE result JSONB; grouping TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_org_member(target_org) THEN
    RAISE EXCEPTION 'An active shop membership is required';
  END IF;
  IF start_date IS NULL OR end_date IS NULL OR start_date > end_date THEN
    RAISE EXCEPTION 'Choose a valid date range';
  END IF;
  IF filter_type NOT IN ('all', 'income', 'expense', 'capital_in', 'withdrawal', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;
  grouping := CASE WHEN end_date-start_date < 31 THEN 'day' WHEN end_date-start_date < 120 THEN 'week' ELSE 'month' END;
  WITH scoped AS MATERIALIZED (
    SELECT t.*, COALESCE(c.name, CASE t.type WHEN 'income' THEN 'General Income' WHEN 'expense' THEN 'General Expense' ELSE 'Uncategorised' END) AS category_name
    FROM public.transactions t
    LEFT JOIN public.categories c ON c.id=t.category_id AND c.organization_id=t.organization_id
    WHERE t.organization_id=target_org AND t.status='active'
      AND t.business_date BETWEEN start_date AND end_date
      AND (filter_type='all' OR t.type::TEXT=filter_type)
      AND (filter_category IS NULL OR t.category_id=filter_category)
  ), totals AS (
    SELECT COALESCE(SUM(amount_paisa) FILTER (WHERE type='income'),0) AS income_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='expense'),0) AS expense_paisa,
      COALESCE(SUM(CASE WHEN type='income' THEN amount_paisa WHEN type='expense' THEN -amount_paisa ELSE 0 END),0) AS net_profit_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='capital_in'),0) AS capital_in_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='withdrawal'),0) AS withdrawal_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='adjustment' AND adjustment_dir='in'),0) AS adjustment_in_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='adjustment' AND adjustment_dir='out'),0) AS adjustment_out_paisa,
      COUNT(*) AS transaction_count FROM scoped
  ), trend AS (
    SELECT pg_catalog.date_trunc(grouping,business_date::TIMESTAMP)::DATE::TEXT AS key,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='income'),0) AS income_paisa,
      COALESCE(SUM(amount_paisa) FILTER (WHERE type='expense'),0) AS expense_paisa,
      COALESCE(SUM(CASE WHEN type='income' THEN amount_paisa WHEN type='expense' THEN -amount_paisa ELSE 0 END),0) AS net_profit_paisa,
      COUNT(*) AS transaction_count FROM scoped GROUP BY 1
  ), categories AS (
    SELECT COALESCE(category_id::TEXT,'uncategorised')||':'||type::TEXT AS key,
      category_id,category_name,type,SUM(amount_paisa) AS total_paisa,COUNT(*) AS entry_count
    FROM scoped GROUP BY category_id,category_name,type
  ) SELECT pg_catalog.jsonb_build_object(
    'totals',(SELECT pg_catalog.to_jsonb(totals) FROM totals),
    'trend',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(trend) ORDER BY key) FROM trend),'[]'::JSONB),
    'categories',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(categories) ORDER BY total_paisa DESC) FROM categories),'[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cashbook_period_analytics(UUID,DATE,DATE,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cashbook_period_analytics(UUID,DATE,DATE,TEXT,UUID) TO authenticated;
-- Complement existing organization/date indexes for newest-first pages and FK checks.
CREATE INDEX IF NOT EXISTS idx_transactions_org_device_id ON public.transactions(organization_id,device_entry_time DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_org_fk ON public.transactions(account_id,organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_org_fk ON public.transactions(category_id,organization_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_transaction_fk ON public.account_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_account_ledger_transfer_fk ON public.account_ledger_entries(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transaction_drafts_category_org_fk ON public.transaction_drafts(category_id,organization_id);
CREATE INDEX IF NOT EXISTS idx_transaction_drafts_creator_fk ON public.transaction_drafts(created_by);
