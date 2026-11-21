CREATE FUNCTION private.aqvora_sales_source_valid(p_org uuid,p_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aqvora_sales_invoices d
    JOIN public.aqvora_journals j ON j.organization_id=p_org AND j.id=d.journal_id
    JOIN public.aqvora_sales_issue_receipts r ON r.organization_id=p_org AND r.invoice_id=d.id AND r.journal_id=j.id
    JOIN public.aqvora_posting_receipts pr ON pr.organization_id=p_org AND pr.journal_id=j.id AND pr.intent_key=j.intent_key
    WHERE d.organization_id=p_org AND d.id=p_invoice AND d.state='issued'
      AND j.source_kind='sales_invoice' AND j.source_id=d.id AND j.source_revision=d.revision-1
      AND j.source_fingerprint=d.fingerprint AND d.fingerprint=private.aqvora_sales_fingerprint(d)
      AND j.business_date=d.business_date AND j.currency=d.currency AND j.total_minor=d.face_minor AND j.reversal_of IS NULL
      AND d.policy_snapshot->>'tax_treatment'='verified_out_of_scope'
      AND d.policy_snapshot->>'currency'=d.currency AND d.customer_snapshot->>'id'=d.customer_id::text
      AND (private.aqvora_sales_lines((SELECT jsonb_agg(jsonb_build_object(
        'description',l->>'description','quantity_millionths',l->>'quantity_millionths',
        'unit_price_minor',l->>'unit_price_minor','discount_minor',l->>'discount_minor') ORDER BY ord)
        FROM jsonb_array_elements(d.lines) WITH ORDINALITY AS x(l,ord)))) =
        jsonb_build_object('lines',d.lines,'gross_minor',d.gross_minor::text,'discount_minor',d.discount_minor::text,'face_minor',d.face_minor::text)
      AND j.payload @> jsonb_build_object('sales_invoice_id',d.id,'source_revision',(d.revision-1)::text,'source_fingerprint',d.fingerprint)
      AND pr.payload=j.payload
      AND j.payload @> jsonb_build_object('business_date',d.business_date,'currency',d.currency,'reversal_of',NULL,'reason',NULL)
      AND j.payload->'lines'=jsonb_build_array(
        jsonb_build_object('account_id',d.policy_snapshot->>'ar_account_id','debit_minor',d.face_minor::text,'credit_minor','0',
          'party_id',d.customer_id::text,'open_item_id',d.id::text,'stock_movement_id',NULL),
        jsonb_build_object('account_id',d.policy_snapshot->>'revenue_account_id','debit_minor','0','credit_minor',d.face_minor::text,
          'party_id',NULL,'open_item_id',NULL,'stock_movement_id',NULL))
      AND EXISTS (SELECT 1 FROM public.aqvora_periods p WHERE p.organization_id=p_org AND p.id=j.period_id
        AND d.business_date BETWEEN p.starts_on AND p.ends_on)
      AND r.request=jsonb_build_object('invoice_id',d.id,'expected_revision',(d.revision-1)::text,
        'fingerprint',d.fingerprint,'actor_id',j.posted_by)
      AND r.response @> jsonb_build_object('organization_id',p_org,'invoice_id',d.id,'journal_id',j.id,
        'journal_intent_key',j.intent_key,'customer_id',d.customer_id,'business_date',d.business_date,'currency',d.currency,
        'face_minor',d.face_minor::text,'source_revision',(d.revision-1)::text,'issued_revision',d.revision::text,
        'document_number','SI-' || d.document_number::text,'fingerprint',d.fingerprint,'intent_key',r.intent_key,
        'posted_by',j.posted_by,'posted_at',j.posted_at)
      AND (SELECT count(*) FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id)=2
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id AND l.line_no=1
        AND l.account_id=(d.policy_snapshot->>'ar_account_id')::uuid AND l.debit_minor=d.face_minor AND l.credit_minor=0
        AND l.party_id=d.customer_id::text AND l.open_item_id=d.id::text AND l.stock_movement_id IS NULL)
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id AND l.line_no=2
        AND l.account_id=(d.policy_snapshot->>'revenue_account_id')::uuid AND l.debit_minor=0 AND l.credit_minor=d.face_minor
        AND l.party_id IS NULL AND l.open_item_id IS NULL AND l.stock_movement_id IS NULL)
      AND (SELECT count(*) FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id)=1
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id
        AND a.action='POST' AND a.actor_id=j.posted_by AND a.details=jsonb_build_object('reversal_of',NULL,'reason',NULL))
      AND (SELECT count(*)=d.revision AND min(revision)=1 AND max(revision)=d.revision
        AND bool_and(coalesce(after_row->>'revision'=revision::text AND after_row->>'id'=d.id::text
          AND ((revision=1 AND action='CREATE' AND before_row IS NULL) OR
               (revision>1 AND before_row=previous_row)),false))
        FROM (SELECT a.*,lag(after_row) OVER (ORDER BY revision) AS previous_row FROM public.aqvora_sales_audit a
          WHERE a.organization_id=p_org AND a.entity_type='invoice' AND a.entity_id=d.id) history)
      AND EXISTS (SELECT 1 FROM public.aqvora_sales_audit a WHERE a.organization_id=p_org AND a.entity_type='invoice'
        AND a.entity_id=d.id AND a.revision=d.revision AND a.action='ISSUE' AND a.actor_id=j.posted_by
        AND a.after_row=private.aqvora_sales_json(d))
      AND EXISTS (SELECT 1 FROM public.aqvora_sales_audit a WHERE a.organization_id=p_org AND a.entity_type='invoice'
        AND a.entity_id=d.id AND a.revision=d.revision-1 AND a.action='APPROVE' AND a.actor_id=d.approved_by
        AND a.after_row->>'fingerprint'=d.fingerprint)
  );
$$;
REVOKE ALL ON FUNCTION private.aqvora_sales_source_valid(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Preserve the original public wrapper dependency/OID. The internal journal-only
-- certifier below is the unchanged #53 implementation, with a private new name.

CREATE FUNCTION private.aqvora_certify_journal_read(
  p_org uuid, p_from date, p_to date, p_currency text, p_token text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET timezone = 'UTC' SET datestyle = 'ISO, YMD' AS $$
DECLARE
  actor uuid := auth.uid(); member_role text; company_currency text;
  journal_count bigint; line_count numeric; debit_total numeric; credit_total numeric;
  source_hash text; chart_hash text; period_hash text; token text; valid boolean;
BEGIN
  IF actor IS NULL OR p_org IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s
      WHERE s.id = nullif(auth.jwt()->>'session_id','')::uuid AND s.user_id = actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AQVORA read requires a live authenticated MFA session';
  END IF;
  SELECT m.role INTO member_role FROM public.organization_members m
    WHERE m.organization_id = p_org AND m.user_id = actor AND m.is_active
      AND m.role IN ('OWNER','MANAGER');
  IF member_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AQVORA read is not authorized for this company';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to
    OR p_from NOT BETWEEN date '0001-01-01' AND date '9999-12-31'
    OR p_to NOT BETWEEN date '0001-01-01' AND date '9999-12-31' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AQVORA report dates';
  END IF;
  SELECT o.currency INTO company_currency FROM public.organizations o WHERE o.id = p_org;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR company_currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AQVORA report currency';
  END IF;

  -- Each complete journal must reconcile to its header, canonical payload,
  -- same-company chart/period, durable receipt and single immutable audit event.
  -- Widen sums to NUMERIC: company aggregates may exceed signed BIGINT.
  WITH checked AS (
    SELECT j.id, j.total_minor, to_jsonb(j)::text AS header, l.*,
      r.payload AS receipt_payload, to_jsonb(r)::text AS receipt,
      audit.n AS audit_count, audit.valid AS audit_valid, audit.contents AS audit_contents,
      (j.currency = p_currency AND p.id IS NOT NULL
        AND j.business_date BETWEEN p.starts_on AND p.ends_on
        AND j.payload @> jsonb_build_object('business_date',j.business_date,
          'currency',j.currency,'reversal_of',j.reversal_of,'reason',j.reason)
        AND jsonb_array_length(j.payload->'lines') = l.n
        AND (j.reversal_of IS NULL OR EXISTS (
          SELECT 1 FROM public.aqvora_journals original
          WHERE original.organization_id = p_org AND original.id = j.reversal_of
            AND original.reversal_of IS NULL AND original.total_minor = j.total_minor
            AND (SELECT count(*) FROM public.aqvora_journal_lines ol
              WHERE ol.organization_id = p_org AND ol.journal_id = original.id) = l.n
            AND NOT EXISTS (
              SELECT 1 FROM public.aqvora_journal_lines rl
              LEFT JOIN public.aqvora_journal_lines ol
                ON ol.organization_id = p_org AND ol.journal_id = original.id AND ol.line_no = rl.line_no
              WHERE rl.organization_id = p_org AND rl.journal_id = j.id
                AND (ol.journal_id IS NULL OR
                  (rl.account_id,rl.debit_minor,rl.credit_minor,rl.party_id,rl.open_item_id,rl.stock_movement_id)
                  IS DISTINCT FROM
                  (ol.account_id,ol.credit_minor,ol.debit_minor,ol.party_id,ol.open_item_id,ol.stock_movement_id))
            )))) AS header_valid
    FROM public.aqvora_journals j
    LEFT JOIN public.aqvora_periods p ON p.organization_id = p_org AND p.id = j.period_id
    LEFT JOIN public.aqvora_posting_receipts r
      ON r.organization_id = p_org AND r.journal_id = j.id AND r.intent_key = j.intent_key
    CROSS JOIN LATERAL (
      SELECT count(*) AS n, coalesce(sum(line.debit_minor),0) AS dr,
        coalesce(sum(line.credit_minor),0) AS cr,
        min(line.line_no) = 1 AND max(line.line_no) = count(*)
          AND bool_and(coalesce(a.is_posting
            AND jsonb_typeof(j.payload->'lines'->(line.line_no-1)->'account_id') = 'string'
            AND jsonb_typeof(j.payload->'lines'->(line.line_no-1)->'debit_minor') = 'string'
            AND jsonb_typeof(j.payload->'lines'->(line.line_no-1)->'credit_minor') = 'string'
            AND (j.payload->'lines'->(line.line_no-1)->>'account_id') = line.account_id::text
            AND (j.payload->'lines'->(line.line_no-1)->>'debit_minor') = line.debit_minor::text
            AND (j.payload->'lines'->(line.line_no-1)->>'credit_minor') = line.credit_minor::text
            AND (j.payload->'lines'->(line.line_no-1)->>'party_id') IS NOT DISTINCT FROM line.party_id
            AND (j.payload->'lines'->(line.line_no-1)->>'open_item_id') IS NOT DISTINCT FROM line.open_item_id
            AND (j.payload->'lines'->(line.line_no-1)->>'stock_movement_id') IS NOT DISTINCT FROM line.stock_movement_id,false))
          AS lines_valid,
        jsonb_agg(to_jsonb(line) ORDER BY line.line_no)::text AS contents
      FROM public.aqvora_journal_lines line
      LEFT JOIN public.aqvora_accounts a ON a.organization_id = p_org AND a.id = line.account_id
      WHERE line.organization_id = p_org AND line.journal_id = j.id
    ) l
    CROSS JOIN LATERAL (
      SELECT count(*) AS n, jsonb_agg(to_jsonb(event) ORDER BY event.id)::text AS contents,
        bool_and(event.actor_id = j.posted_by
          AND event.action = CASE WHEN j.reversal_of IS NULL THEN 'POST' ELSE 'REVERSE' END
          AND event.details = jsonb_build_object('reversal_of',j.reversal_of,'reason',j.reason)) AS valid
      FROM public.aqvora_journal_audit event
      WHERE event.organization_id = p_org AND event.journal_id = j.id
    ) audit
    WHERE j.organization_id = p_org AND j.business_date <= p_to
  ) SELECT count(*), coalesce(sum(n),0), coalesce(sum(dr),0), coalesce(sum(cr),0),
    coalesce(bool_and(coalesce(header_valid AND lines_valid AND n BETWEEN 2 AND 100
      AND dr = total_minor AND cr = total_minor AND audit_count = 1 AND audit_valid
      AND receipt_payload IS NOT NULL AND receipt_payload = header::jsonb->'payload',false)),true),
    encode(sha256(convert_to(coalesce(string_agg(
      encode(sha256(convert_to(jsonb_build_array(header,contents,receipt,audit_contents)::text,'UTF8')),'hex'),
      '' ORDER BY id),''),'UTF8')),'hex')
  INTO journal_count,line_count,debit_total,credit_total,valid,source_hash FROM checked;
  IF NOT valid OR debit_total <> credit_total THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AQVORA financial source is incomplete or inconsistent';
  END IF;
  SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY a.id),''),'UTF8')),'hex')
    INTO chart_hash FROM public.aqvora_accounts a WHERE a.organization_id = p_org;
  SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.id),''),'UTF8')),'hex')
    INTO period_hash FROM public.aqvora_periods p WHERE p.organization_id = p_org;
  token := encode(sha256(convert_to(jsonb_build_array('aqvora-read-v1',p_org,p_from,p_to,
    p_currency,source_hash,chart_hash,period_hash)::text,'UTF8')),'hex');
  IF p_token IS NOT NULL AND p_token IS DISTINCT FROM token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'AQVORA report source changed; restart pagination';
  END IF;
  RETURN jsonb_build_object('contract_version','aqvora-read-v1','organization_id',p_org,
    'currency',p_currency,'from_date',p_from,'to_date',p_to,'snapshot_token',token,
    'observed_at',statement_timestamp(),'authorized_user_id',actor,'authorized_role',member_role,
    'basis','v2_posted_journals','source_complete',true,'legacy_included',false,
    'opening_migration_verified',false,'source_journal_count',journal_count::text,
    'source_line_count',line_count::text,'source_debit_minor',debit_total::text,
    'source_credit_minor',credit_total::text,'consistency','restart_on_source_change');
END $$;
REVOKE ALL ON FUNCTION private.aqvora_certify_journal_read(uuid,date,date,text,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.aqvora_certify_read(p_org uuid,p_from date,p_to date,p_currency text,p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  result := private.aqvora_certify_journal_read(p_org,p_from,p_to,p_currency,p_token);
  IF EXISTS (SELECT 1 FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_org
    AND d.state='issued' AND d.business_date<=p_to AND NOT private.aqvora_sales_source_valid(p_org,d.id))
    OR EXISTS (SELECT 1 FROM public.aqvora_journals j WHERE j.organization_id=p_org AND j.business_date<=p_to
      AND j.source_kind='sales_invoice' AND NOT EXISTS (SELECT 1 FROM public.aqvora_sales_invoices d
        WHERE d.organization_id=p_org AND d.id=j.source_id AND d.state='issued' AND d.journal_id=j.id))
    OR EXISTS (SELECT 1 FROM public.aqvora_journals j JOIN public.aqvora_journal_lines l
      ON l.organization_id=p_org AND l.journal_id=j.id JOIN public.aqvora_accounts a
      ON a.organization_id=p_org AND a.id=l.account_id WHERE j.organization_id=p_org AND j.business_date<=p_to
        AND a.control_role='receivable' AND j.source_kind IS DISTINCT FROM 'sales_invoice') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='AQVORA verified sales source is incomplete or inconsistent';
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_certify_read(uuid,date,date,text,text) FROM PUBLIC,anon,authenticated;

