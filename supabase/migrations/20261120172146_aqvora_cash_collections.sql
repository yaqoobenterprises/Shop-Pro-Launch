CREATE FUNCTION public.create_aqvora_cash_collection(p_organization_id uuid,p_intent_key text,p_customer_id uuid,
  p_business_date date,p_currency text,p_amount_minor jsonb,p_source_kind text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; amount bigint; request jsonb; c public.aqvora_cash_collections;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id); amount:=private.aqvora_receipt_minor(p_amount_minor);
  IF p_source_kind IS DISTINCT FROM 'controlled_cash' THEN RAISE EXCEPTION 'Only controlled cash is supported; bank evidence is unavailable'; END IF;
  IF p_intent_key IS NULL OR length(p_intent_key) NOT BETWEEN 1 AND 100 OR p_intent_key<>btrim(p_intent_key) THEN
    RAISE EXCEPTION 'Cash collection creation intent required'; END IF;
  request:=jsonb_build_object('actor_id',actor,'customer_id',p_customer_id,'business_date',p_business_date,
    'currency',p_currency,'amount_minor',amount::text,'source_kind',p_source_kind);
  -- Serialize this intent before allocating its evidence number. No counter gaps on replay.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':cash:'||p_intent_key,0));
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND creation_intent=p_intent_key;
  IF FOUND THEN
    IF c.creation_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Cash creation idempotency payload mismatch'; END IF;
    RETURN private.aqvora_cash_json(c);
  END IF;
  PERFORM private.aqvora_receipt_context(p_organization_id,p_customer_id,p_business_date,p_currency);
  INSERT INTO public.aqvora_cash_collections(organization_id,creation_intent,creation_request,collection_number,
    customer_id,business_date,currency,amount_minor,created_by,maker_session_fingerprint)
    VALUES(p_organization_id,p_intent_key,request,private.aqvora_receipt_next(p_organization_id,'collection'),
      p_customer_id,p_business_date,p_currency,amount,actor,encode(sha256(convert_to(auth.jwt()->>'session_id','UTF8')),'hex')) RETURNING * INTO c;
  PERFORM private.aqvora_receipt_event(p_organization_id,'collection',c.id,c.revision,'CREATE',actor,NULL,private.aqvora_cash_json(c));
  RETURN private.aqvora_cash_json(c);
END $$;
CREATE FUNCTION public.confirm_aqvora_cash_collection(p_organization_id uuid,p_collection_id uuid,p_expected_revision bigint,
  p_counted_minor jsonb,p_attestation text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE actor uuid; c public.aqvora_cash_collections; prior jsonb; context jsonb;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id);
  PERFORM 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=actor AND role='OWNER' AND is_active;
  IF NOT FOUND OR p_attestation IS DISTINCT FROM 'cash_counted_in_person' THEN RAISE EXCEPTION 'Distinct OWNER cash-count attestation required'; END IF;
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND id=p_collection_id FOR UPDATE;
  IF NOT FOUND OR c.state<>'draft' OR c.revision IS DISTINCT FROM p_expected_revision OR c.created_by=actor THEN
    RAISE EXCEPTION 'Cash source is unavailable, immutable, stale or self-confirmed'; END IF;
  IF private.aqvora_receipt_minor(p_counted_minor)<>c.amount_minor THEN RAISE EXCEPTION 'Counted cash differs from collection claim'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.aqvora_receipt_audit a WHERE a.organization_id=p_organization_id AND a.entity_type='collection'
    AND a.entity_id=c.id AND a.revision=c.revision AND a.action='CREATE' AND a.actor_id=c.created_by AND a.after_row=private.aqvora_cash_json(c)) THEN
    RAISE EXCEPTION 'Cash claim audit does not certify the source'; END IF;
  context:=private.aqvora_receipt_context(p_organization_id,c.customer_id,c.business_date,c.currency);
  prior:=private.aqvora_cash_json(c); c.confirmed_by:=actor;c.confirmed_at:=statement_timestamp();
  c.customer_snapshot:=context->'customer';c.policy_snapshot:=context->'policy';
  c.checker_session_fingerprint:=encode(sha256(convert_to(auth.jwt()->>'session_id','UTF8')),'hex');
  c.fingerprint:=private.aqvora_cash_fingerprint(c);
  UPDATE public.aqvora_cash_collections SET state='confirmed',revision=revision+1,confirmed_by=c.confirmed_by,
    confirmed_at=c.confirmed_at,checker_session_fingerprint=c.checker_session_fingerprint,
    customer_snapshot=c.customer_snapshot,policy_snapshot=c.policy_snapshot,fingerprint=c.fingerprint
    WHERE organization_id=p_organization_id AND id=p_collection_id RETURNING * INTO c;
  PERFORM private.aqvora_receipt_event(p_organization_id,'collection',c.id,c.revision,'CONFIRM',actor,prior,private.aqvora_cash_json(c));
  RETURN private.aqvora_cash_json(c);
END $$;
CREATE FUNCTION public.cancel_aqvora_cash_collection(p_organization_id uuid,p_collection_id uuid,p_expected_revision bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;c public.aqvora_cash_collections;prior jsonb;
BEGIN
  actor:=private.aqvora_sales_authorize(p_organization_id);
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND id=p_collection_id FOR UPDATE;
  IF NOT FOUND OR c.state<>'draft' OR c.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Cash claim is unavailable, immutable or stale'; END IF;
  IF c.created_by<>actor AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=actor AND role='OWNER') THEN
    RAISE EXCEPTION 'Only maker or OWNER may cancel a cash claim'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Cash cancellation reason required'; END IF;
  prior:=private.aqvora_cash_json(c);
  UPDATE public.aqvora_cash_collections SET state='cancelled',cancel_reason=p_reason,revision=revision+1
    WHERE organization_id=p_organization_id AND id=p_collection_id RETURNING * INTO c;
  PERFORM private.aqvora_receipt_event(p_organization_id,'collection',c.id,c.revision,'CANCEL',actor,prior,private.aqvora_cash_json(c),p_reason);
  RETURN private.aqvora_cash_json(c);
END $$;
REVOKE ALL ON FUNCTION public.create_aqvora_cash_collection(uuid,text,uuid,date,text,jsonb,text),
  public.confirm_aqvora_cash_collection(uuid,uuid,bigint,jsonb,text),public.cancel_aqvora_cash_collection(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_cash_collection(uuid,text,uuid,date,text,jsonb,text),
  public.confirm_aqvora_cash_collection(uuid,uuid,bigint,jsonb,text),public.cancel_aqvora_cash_collection(uuid,uuid,bigint,text) TO authenticated;
