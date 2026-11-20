CREATE FUNCTION public.get_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.aqvora_sales_invoices; result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_organization_id AND id=p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales invoice is unavailable in this company'; END IF;
  result := private.aqvora_sales_json(d);
  IF d.state='issued' THEN
    IF NOT private.aqvora_sales_source_valid(p_organization_id,d.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Verified sales source is incomplete or inconsistent';
    END IF;
    result := result || jsonb_build_object('issue_receipt',(SELECT r.response FROM public.aqvora_sales_issue_receipts r
      WHERE r.organization_id=p_organization_id AND r.invoice_id=d.id),
      'reconciliation',jsonb_build_object('source_complete',true,'face_minor',d.face_minor::text,
        'ar_debit_minor',d.face_minor::text,'revenue_credit_minor',d.face_minor::text,
        'settlements_supported',false,'basis','unsettled_issued_service_invoice'));
  END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.lookup_aqvora_sales_issue(p_organization_id uuid,p_intent_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.aqvora_sales_issue_receipts;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO r FROM public.aqvora_sales_issue_receipts WHERE organization_id=p_organization_id AND intent_key=p_intent_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.get_aqvora_sales_invoice(p_organization_id,r.invoice_id);
  RETURN r.response;
END $$;
CREATE FUNCTION public.list_aqvora_sales_invoices(p_organization_id uuid,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Sales page size must be 1-200'; END IF;
  SELECT coalesce(jsonb_agg(public.get_aqvora_sales_invoice(p_organization_id,d.id) ORDER BY d.id),'[]') INTO result
    FROM (SELECT id FROM public.aqvora_sales_invoices WHERE organization_id=p_organization_id
      AND (p_after_id IS NULL OR id>p_after_id) ORDER BY id LIMIT p_limit) d;
  RETURN result;
END $$;
CREATE FUNCTION public.list_aqvora_sales_audit(p_organization_id uuid,p_invoice_id uuid,
  p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.get_aqvora_sales_invoice(p_organization_id,p_invoice_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_after_id IS NULL OR p_after_id<0 THEN
    RAISE EXCEPTION 'Invalid sales audit page'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('id',a.id::text,'revision',a.revision::text) ORDER BY a.id),'[]')
    INTO result FROM (SELECT * FROM public.aqvora_sales_audit WHERE organization_id=p_organization_id
      AND entity_type='invoice' AND entity_id=p_invoice_id AND id>p_after_id ORDER BY id LIMIT p_limit) a;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_aqvora_sales_invoice(uuid,uuid),public.lookup_aqvora_sales_issue(uuid,text),
  public.list_aqvora_sales_invoices(uuid,uuid,integer),public.list_aqvora_sales_audit(uuid,uuid,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_aqvora_sales_invoice(uuid,uuid),public.lookup_aqvora_sales_issue(uuid,text),
  public.list_aqvora_sales_invoices(uuid,uuid,integer),public.list_aqvora_sales_audit(uuid,uuid,bigint,integer) TO authenticated;

-- Additive GL source provenance; pagination and money contracts are unchanged.
CREATE OR REPLACE FUNCTION public.read_aqvora_general_ledger(
  p_organization_id uuid, p_account_id uuid, p_from_date date, p_to_date date,
  p_currency text, p_limit integer DEFAULT 100, p_cursor jsonb DEFAULT NULL,
  p_snapshot_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET timezone = 'UTC' SET datestyle = 'ISO, YMD' AS $$
DECLARE
  source jsonb; account public.aqvora_accounts; opening numeric; result jsonb;
  after_date date; after_journal uuid; after_line integer;
BEGIN
  source := private.aqvora_certify_read(p_organization_id,p_from_date,p_to_date,p_currency,p_snapshot_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AQVORA report page size must be 1-200';
  END IF;
  SELECT * INTO account FROM public.aqvora_accounts a
    WHERE a.organization_id = p_organization_id AND a.id = p_account_id AND a.is_posting;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AQVORA posting account is unavailable in this company';
  END IF;
  IF p_cursor IS NOT NULL THEN
    IF p_snapshot_token IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AQVORA cursor requires its snapshot token';
    END IF;
    SELECT j.business_date,j.id,l.line_no INTO after_date,after_journal,after_line
      FROM public.aqvora_journal_lines l JOIN public.aqvora_journals j
        ON j.organization_id = p_organization_id AND j.id = l.journal_id
      WHERE l.organization_id = p_organization_id AND l.account_id = p_account_id
        AND j.business_date BETWEEN p_from_date AND p_to_date
        AND jsonb_build_object('snapshot_token',source->>'snapshot_token','kind','general_ledger',
          'account_id',p_account_id,'business_date',j.business_date,'journal_id',j.id,'line_no',l.line_no) = p_cursor;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AQVORA report cursor';
    END IF;
  END IF;
  SELECT coalesce(sum(l.debit_minor::numeric-l.credit_minor),0) INTO opening
    FROM public.aqvora_journal_lines l JOIN public.aqvora_journals j
      ON j.organization_id = p_organization_id AND j.id = l.journal_id
    WHERE l.organization_id = p_organization_id AND l.account_id = p_account_id
      AND j.business_date < p_from_date;
  WITH history AS MATERIALIZED (
    SELECT j.business_date,j.id AS journal_id,l.line_no,l.debit_minor,l.credit_minor,
      row_number() OVER (ORDER BY j.business_date,j.id,l.line_no) AS ordinal,
      opening + sum(l.debit_minor::numeric-l.credit_minor) OVER
        (ORDER BY j.business_date,j.id,l.line_no ROWS UNBOUNDED PRECEDING) AS running,
      jsonb_build_object('journal_id',j.id,'intent_key',j.intent_key,
        'business_date',j.business_date,'posted_at',j.posted_at,'posted_by',j.posted_by,
        'source_kind',j.source_kind,'source_id',j.source_id,'source_revision',j.source_revision::text,
        'source_fingerprint',j.source_fingerprint,'period_id',j.period_id,'reversal_of',j.reversal_of,'reversal_reason',j.reason,
        'line_no',l.line_no,'account_id',l.account_id,'debit_minor',l.debit_minor::text,
        'credit_minor',l.credit_minor::text,'party_id',l.party_id,'open_item_id',l.open_item_id,
        'stock_movement_id',l.stock_movement_id,
        'audit_event_id',(SELECT e.id::text FROM public.aqvora_journal_audit e
          WHERE e.organization_id = p_organization_id AND e.journal_id = j.id)) AS entry
    FROM public.aqvora_journal_lines l JOIN public.aqvora_journals j
      ON j.organization_id = p_organization_id AND j.id = l.journal_id
    WHERE l.organization_id = p_organization_id AND l.account_id = p_account_id
      AND j.business_date BETWEEN p_from_date AND p_to_date
  ), page AS MATERIALIZED (
    SELECT * FROM history WHERE p_cursor IS NULL
      OR (business_date,journal_id,line_no) > (after_date,after_journal,after_line)
    ORDER BY business_date,journal_id,line_no LIMIT p_limit
  ), totals AS (
    SELECT count(*) AS n,coalesce(sum(debit_minor),0) AS dr,coalesce(sum(credit_minor),0) AS cr FROM history
  ) SELECT jsonb_build_object(
    'account',to_jsonb(account) || jsonb_build_object('revision',account.revision::text),
    'opening_minor',opening::text,'debit_minor',totals.dr::text,'credit_minor',totals.cr::text,
    'closing_minor',(opening+totals.dr-totals.cr)::text,'matched_count',totals.n::text,
    'returned_count',(SELECT count(*) FROM page),'has_more',coalesce((SELECT max(ordinal) FROM page) < totals.n,false),
    'rows',coalesce((SELECT jsonb_agg(entry || jsonb_build_object(
      'ordinal',ordinal::text,'running_balance_minor',running::text) ORDER BY ordinal) FROM page),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT max(ordinal) FROM page) < totals.n THEN
      (SELECT jsonb_build_object('snapshot_token',source->>'snapshot_token','kind','general_ledger',
        'account_id',p_account_id,'business_date',business_date,'journal_id',journal_id,'line_no',line_no)
        FROM page ORDER BY ordinal DESC LIMIT 1) ELSE NULL END)
    INTO result FROM totals;
  RETURN jsonb_build_object('source',source) || result;
END $$;
REVOKE ALL ON FUNCTION public.read_aqvora_general_ledger(uuid,uuid,date,date,text,integer,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_aqvora_general_ledger(uuid,uuid,date,date,text,integer,jsonb,text)
  TO authenticated;
