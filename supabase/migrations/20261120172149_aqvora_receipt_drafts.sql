CREATE FUNCTION private.aqvora_receipt_validate_locked(r public.aqvora_customer_receipts) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.aqvora_cash_collections;context jsonb;normalized jsonb;allocation jsonb;balance jsonb;
BEGIN
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=r.organization_id AND id=r.collection_id FOR UPDATE;
  IF NOT FOUND OR c.state<>'confirmed' OR c.created_by<>r.created_by OR c.fingerprint IS DISTINCT FROM r.collection_fingerprint
    OR (c.customer_id,c.business_date,c.currency,c.amount_minor) IS DISTINCT FROM (r.customer_id,r.business_date,r.currency,r.amount_minor)
    OR NOT private.aqvora_cash_source_valid(r.organization_id,c.id) THEN RAISE EXCEPTION 'Receipt cash source is unverified or mismatched'; END IF;
  PERFORM 1 FROM public.organization_members WHERE organization_id=r.organization_id AND user_id=c.confirmed_by AND role='OWNER' AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash checker authorization is no longer valid'; END IF;
  context:=private.aqvora_receipt_context(r.organization_id,r.customer_id,r.business_date,r.currency);
  IF context->'policy'->>'cash_account_id' IS DISTINCT FROM c.policy_snapshot->>'cash_account_id'
    OR (r.policy_snapshot IS NOT NULL AND r.policy_snapshot IS DISTINCT FROM context->'policy') THEN
    RAISE EXCEPTION 'Receipt policy changed; reject or cancel and reapprove'; END IF;
  normalized:=private.aqvora_receipt_normalize(r.organization_id,r.customer_id,r.currency,r.business_date,
    (context->'policy'->>'ar_account_id')::uuid,private.aqvora_receipt_raw_allocations(r.allocations));
  IF normalized IS DISTINCT FROM r.allocations OR (SELECT sum((a->>'amount_minor')::numeric) FROM jsonb_array_elements(normalized)x(a))<>r.amount_minor THEN
    RAISE EXCEPTION 'Stale invoice source or receipt allocations do not equal the instrument'; END IF;
  -- All writers lock the exact same invoice rows, in UUID order, before checking
  -- cumulative posted allocations. Approval does not reserve an open balance.
  PERFORM i.id FROM public.aqvora_sales_invoices i JOIN jsonb_array_elements(r.allocations)x(a)
    ON i.id=(a->>'invoice_id')::uuid WHERE i.organization_id=r.organization_id ORDER BY i.id FOR UPDATE OF i;
  FOR allocation IN SELECT value FROM jsonb_array_elements(r.allocations) ORDER BY value->>'invoice_id' LOOP
    balance:=private.aqvora_invoice_allocation_state(r.organization_id,(allocation->>'invoice_id')::uuid,NULL);
    IF (allocation->>'amount_minor')::numeric>(balance->>'outstanding_minor')::numeric THEN
      RAISE EXCEPTION 'Receipt over-allocation exceeds the verified invoice outstanding balance'; END IF;
  END LOOP;
  RETURN context;
END $$;
CREATE FUNCTION public.create_aqvora_customer_receipt_draft(p_organization_id uuid,p_intent_key text,p_collection_id uuid,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;c public.aqvora_cash_collections;r public.aqvora_customer_receipts;context jsonb;request jsonb;normalized jsonb;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id);
  IF p_intent_key IS NULL OR length(p_intent_key) NOT BETWEEN 1 AND 100 OR p_intent_key<>btrim(p_intent_key) THEN RAISE EXCEPTION 'Receipt creation intent required'; END IF;
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND id=p_collection_id FOR UPDATE;
  IF NOT FOUND OR c.created_by<>actor OR c.state<>'confirmed' OR NOT private.aqvora_cash_source_valid(p_organization_id,c.id) THEN
    RAISE EXCEPTION 'A confirmed cash collection owned by this maker is required'; END IF;
  -- Normalize only immutable invoice identities before resolving exact retries.
  normalized:=private.aqvora_receipt_normalize(p_organization_id,c.customer_id,c.currency,c.business_date,
    (c.policy_snapshot->>'ar_account_id')::uuid,p_allocations);
  request:=jsonb_build_object('actor_id',actor,'collection_id',c.id,'allocations',normalized);
  SELECT * INTO r FROM public.aqvora_customer_receipts WHERE organization_id=p_organization_id AND creation_intent=p_intent_key;
  IF FOUND THEN
    IF r.creation_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Receipt creation idempotency payload mismatch'; END IF;
    RETURN private.aqvora_customer_receipt_json(r);
  END IF;
  r.organization_id:=p_organization_id;r.id:=gen_random_uuid();r.collection_id:=c.id;r.collection_fingerprint:=c.fingerprint;
  r.customer_id:=c.customer_id;r.business_date:=c.business_date;r.currency:=c.currency;r.amount_minor:=c.amount_minor;
  r.created_by:=actor;r.allocations:=normalized;
  context:=private.aqvora_receipt_validate_locked(r);
  INSERT INTO public.aqvora_customer_receipts(organization_id,id,creation_intent,creation_request,collection_id,collection_fingerprint,
    customer_id,business_date,currency,amount_minor,created_by,allocations)
    VALUES(p_organization_id,r.id,p_intent_key,request,c.id,c.fingerprint,c.customer_id,c.business_date,c.currency,c.amount_minor,actor,normalized)
    RETURNING * INTO r;
  PERFORM private.aqvora_receipt_event(p_organization_id,'receipt',r.id,r.revision,'CREATE',actor,NULL,private.aqvora_customer_receipt_json(r));
  RETURN private.aqvora_customer_receipt_json(r);
END $$;
CREATE FUNCTION public.edit_aqvora_customer_receipt_draft(p_organization_id uuid,p_receipt_id uuid,p_expected_revision bigint,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;r public.aqvora_customer_receipts;prior jsonb;context jsonb;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id);
  SELECT * INTO r FROM public.aqvora_customer_receipts WHERE organization_id=p_organization_id AND id=p_receipt_id FOR UPDATE;
  IF NOT FOUND OR r.state<>'draft' OR r.created_by<>actor OR r.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Receipt draft is unavailable, immutable, not owned or stale'; END IF;
  prior:=private.aqvora_customer_receipt_json(r);
  context:=private.aqvora_receipt_context(p_organization_id,r.customer_id,r.business_date,r.currency);
  r.allocations:=private.aqvora_receipt_normalize(p_organization_id,r.customer_id,r.currency,r.business_date,
    (context->'policy'->>'ar_account_id')::uuid,p_allocations);
  PERFORM private.aqvora_receipt_validate_locked(r);
  UPDATE public.aqvora_customer_receipts SET allocations=r.allocations,revision=revision+1
    WHERE organization_id=p_organization_id AND id=p_receipt_id RETURNING * INTO r;
  PERFORM private.aqvora_receipt_event(p_organization_id,'receipt',r.id,r.revision,'EDIT',actor,prior,private.aqvora_customer_receipt_json(r));
  RETURN private.aqvora_customer_receipt_json(r);
END $$;
CREATE FUNCTION public.transition_aqvora_customer_receipt(p_organization_id uuid,p_receipt_id uuid,p_expected_revision bigint,
  p_action text,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;r public.aqvora_customer_receipts;prior jsonb;context jsonb;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id);
  SELECT * INTO r FROM public.aqvora_customer_receipts WHERE organization_id=p_organization_id AND id=p_receipt_id FOR UPDATE;
  IF NOT FOUND OR r.state IN ('posted','cancelled') OR r.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Receipt source is unavailable, immutable or stale'; END IF;
  prior:=private.aqvora_customer_receipt_json(r);
  IF p_action='submit' AND r.state='draft' AND r.created_by=actor THEN
    context:=private.aqvora_receipt_validate_locked(r);r.policy_snapshot:=context->'policy';
    r.fingerprint:=private.aqvora_receipt_fingerprint(r);r.state:='submitted';
  ELSIF p_action IN ('approve','reject') AND r.state='submitted' THEN
    PERFORM 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=actor AND role='OWNER' AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt approval/rejection requires OWNER'; END IF;
    IF p_action='approve' THEN
      IF actor=r.created_by THEN RAISE EXCEPTION 'Receipt maker/checker must be distinct'; END IF;
      PERFORM private.aqvora_receipt_validate_locked(r);
      IF r.fingerprint IS DISTINCT FROM private.aqvora_receipt_fingerprint(r) THEN RAISE EXCEPTION 'Receipt fingerprint is stale'; END IF;
      r.state:='approved';r.approved_by:=actor;
    ELSE
      IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Receipt rejection reason required'; END IF;
      r.state:='draft';r.policy_snapshot:=NULL;r.fingerprint:=NULL;
    END IF;
  ELSIF p_action='cancel' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Receipt cancellation reason required'; END IF;
    r.state:='cancelled';r.cancel_reason:=p_reason;
  ELSE RAISE EXCEPTION 'Receipt transition is not allowed'; END IF;
  UPDATE public.aqvora_customer_receipts SET state=r.state,approved_by=r.approved_by,policy_snapshot=r.policy_snapshot,
    fingerprint=r.fingerprint,cancel_reason=r.cancel_reason,revision=revision+1 WHERE organization_id=p_organization_id AND id=p_receipt_id RETURNING * INTO r;
  PERFORM private.aqvora_receipt_event(p_organization_id,'receipt',r.id,r.revision,upper(p_action),actor,prior,private.aqvora_customer_receipt_json(r),p_reason);
  RETURN private.aqvora_customer_receipt_json(r);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_receipt_validate_locked(public.aqvora_customer_receipts) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_aqvora_customer_receipt_draft(uuid,text,uuid,jsonb),
  public.edit_aqvora_customer_receipt_draft(uuid,uuid,bigint,jsonb),public.transition_aqvora_customer_receipt(uuid,uuid,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_customer_receipt_draft(uuid,text,uuid,jsonb),
  public.edit_aqvora_customer_receipt_draft(uuid,uuid,bigint,jsonb),public.transition_aqvora_customer_receipt(uuid,uuid,bigint,text,text) TO authenticated;
