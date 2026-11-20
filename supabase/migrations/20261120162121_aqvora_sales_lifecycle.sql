CREATE FUNCTION public.transition_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid,
  p_expected_revision bigint,p_action text,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; d public.aqvora_sales_invoices; prior jsonb; context jsonb;
BEGIN
  actor := private.aqvora_sales_authorize(p_organization_id);
  SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_organization_id AND id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR d.revision IS DISTINCT FROM p_expected_revision OR d.state IN ('issued','cancelled') THEN
    RAISE EXCEPTION 'Sales invoice is unavailable, immutable or stale';
  END IF;
  prior := private.aqvora_sales_json(d);
  IF p_action='submit' AND d.state='draft' AND d.created_by=actor THEN
    context := private.aqvora_sales_context(d);
    d.customer_snapshot := context->'customer'; d.policy_snapshot := context->'policy';
    d.fingerprint := private.aqvora_sales_fingerprint(d); d.state := 'submitted';
  ELSIF p_action IN ('approve','reject') AND d.state='submitted' THEN
    PERFORM 1 FROM public.organization_members WHERE organization_id=p_organization_id
      AND user_id=actor AND role='OWNER' AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales approval/rejection requires OWNER'; END IF;
    IF p_action='approve' THEN
      IF actor=d.created_by THEN RAISE EXCEPTION 'Sales maker and checker must be distinct'; END IF;
      context := private.aqvora_sales_context(d);
      IF d.customer_snapshot IS DISTINCT FROM context->'customer' OR d.policy_snapshot IS DISTINCT FROM context->'policy'
        OR d.fingerprint IS DISTINCT FROM private.aqvora_sales_fingerprint(d) THEN
        RAISE EXCEPTION 'Sales source or policy changed; reject and resubmit';
      END IF;
      d.state := 'approved'; d.approved_by := actor;
    ELSE
      IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
      d.state := 'draft'; d.customer_snapshot := NULL; d.policy_snapshot := NULL; d.fingerprint := NULL;
    END IF;
  ELSIF p_action='cancel' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
    d.state := 'cancelled'; d.cancel_reason := p_reason;
  ELSE RAISE EXCEPTION 'Sales transition is not allowed for this actor or state';
  END IF;
  UPDATE public.aqvora_sales_invoices SET state=d.state,revision=revision+1,approved_by=d.approved_by,
    customer_snapshot=d.customer_snapshot,policy_snapshot=d.policy_snapshot,fingerprint=d.fingerprint,cancel_reason=d.cancel_reason
    WHERE organization_id=p_organization_id AND id=p_invoice_id RETURNING * INTO d;
  PERFORM private.aqvora_sales_audit_event(p_organization_id,'invoice',d.id,d.revision,upper(p_action),actor,
    prior,private.aqvora_sales_json(d),p_reason);
  RETURN private.aqvora_sales_json(d);
END $$;
REVOKE ALL ON FUNCTION public.transition_aqvora_sales_invoice(uuid,uuid,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_aqvora_sales_invoice(uuid,uuid,bigint,text,text) TO authenticated;
