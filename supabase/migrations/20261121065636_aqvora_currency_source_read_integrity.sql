-- Validate scale before serializing every source lifecycle, including drafts.
-- No source, monetary value, fingerprint, receipt or audit row is rewritten.
CREATE FUNCTION private.aqvora_currency_source_policy(
  p_org uuid, p_revision bigint, p_date date, p_currency text, p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE policy jsonb;
BEGIN
  IF p_revision IS NULL THEN
    -- Genuine pre-policy history retains absent scale. A configured source
    -- cannot silently lose its binding or manufacture evidence in a snapshot.
    IF p_snapshot->'currency_policy' IS NOT NULL OR EXISTS (
      SELECT 1 FROM private.aqvora_currency_policies
      WHERE organization_id=p_org AND effective_from<=p_date
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Source currency policy binding is incomplete or inconsistent';
    END IF;
    RETURN NULL;
  END IF;
  policy := private.aqvora_currency_bound(p_org,p_revision);
  IF policy IS NULL OR policy->>'transaction_currency' IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Source currency policy identity is inconsistent';
  END IF;
  IF policy IS DISTINCT FROM private.aqvora_currency_at(p_org,p_date,p_currency)
    OR (p_snapshot IS NOT NULL AND p_snapshot->'currency_policy' IS DISTINCT FROM policy) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Source currency policy date or snapshot is incomplete or inconsistent';
  END IF;
  RETURN policy;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_currency_source_policy(uuid,bigint,date,text,jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.aqvora_sales_json(p public.aqvora_sales_invoices) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE policy jsonb;
BEGIN
  policy := private.aqvora_currency_source_policy(p.organization_id,p.currency_policy_revision,
    p.business_date,p.currency,p.policy_snapshot);
  RETURN (to_jsonb(p)-ARRAY['creation_request','currency_policy_revision']) || jsonb_build_object('revision',p.revision::text,
    'gross_minor',p.gross_minor::text,'discount_minor',p.discount_minor::text,'face_minor',p.face_minor::text,
    'document_number',CASE WHEN p.document_number IS NULL THEN NULL ELSE 'SI-' || p.document_number::text END)
    || CASE WHEN policy IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('currency_policy',policy) END;
END $$;

CREATE OR REPLACE FUNCTION private.aqvora_cash_json(c public.aqvora_cash_collections) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE policy jsonb;
BEGIN
  policy := private.aqvora_currency_source_policy(c.organization_id,c.currency_policy_revision,
    c.business_date,c.currency,c.policy_snapshot);
  RETURN (to_jsonb(c)-ARRAY['creation_request','currency_policy_revision']) || jsonb_build_object('revision',c.revision::text,
    'amount_minor',c.amount_minor::text,'collection_number','CC-'||c.collection_number::text,'source_kind','controlled_cash',
    'evidence_method',CASE WHEN c.state='confirmed' THEN 'dual_control_cash_attestation' ELSE 'unconfirmed_claim' END)
    || CASE WHEN policy IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('currency_policy',policy) END;
END $$;

CREATE OR REPLACE FUNCTION private.aqvora_customer_receipt_json(r public.aqvora_customer_receipts) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE policy jsonb;
BEGIN
  policy := private.aqvora_currency_source_policy(r.organization_id,r.currency_policy_revision,
    r.business_date,r.currency,r.policy_snapshot);
  RETURN (to_jsonb(r)-ARRAY['creation_request','currency_policy_revision']) || jsonb_build_object('revision',r.revision::text,
    'amount_minor',r.amount_minor::text,
    'receipt_number',CASE WHEN r.receipt_number IS NULL THEN NULL ELSE 'CR-'||r.receipt_number::text END)
    || CASE WHEN policy IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('currency_policy',policy) END;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_sales_json(public.aqvora_sales_invoices),
  private.aqvora_cash_json(public.aqvora_cash_collections),
  private.aqvora_customer_receipt_json(public.aqvora_customer_receipts) FROM PUBLIC,anon,authenticated;
