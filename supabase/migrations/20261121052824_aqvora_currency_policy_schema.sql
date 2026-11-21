-- Empty, trusted configuration. No ISO defaults, enrollment or historical backfill.
CREATE TABLE private.aqvora_currency_policies (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  revision bigint NOT NULL CHECK (revision > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  exponent integer NOT NULL CHECK (exponent BETWEEN 0 AND 9),
  effective_from date NOT NULL CHECK (effective_from BETWEEN date '0001-01-01' AND date '9999-12-31'),
  authority_reference text NOT NULL CHECK (length(btrim(authority_reference)) BETWEEN 1 AND 1000),
  authority_revision text NOT NULL CHECK (length(btrim(authority_revision)) BETWEEN 1 AND 160),
  approval_reference text NOT NULL CHECK (length(btrim(approval_reference)) BETWEEN 1 AND 1000),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (organization_id,revision),
  UNIQUE (organization_id,effective_from)
);
ALTER TABLE private.aqvora_currency_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.aqvora_currency_policies FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.aqvora_currency_fingerprint(p private.aqvora_currency_policies) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET datestyle='ISO,YMD' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array('aqvora-currency-policy-v1',
    p.organization_id,p.revision::text,p.currency,p.exponent,p.effective_from,
    p.authority_reference,p.authority_revision,p.approval_reference,p.approved_by)::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION private.aqvora_currency_fingerprint(private.aqvora_currency_policies) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.aqvora_currency_policy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
DECLARE prior private.aqvora_currency_policies; base text; latest date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Currency policy history is immutable';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Currency policy mutations require READ COMMITTED';
  END IF;
  -- Membership before company, matching the financial authorization lock order.
  PERFORM 1 FROM public.organization_members WHERE organization_id=NEW.organization_id
    AND user_id=NEW.approved_by AND is_active AND role='OWNER' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Currency policy requires an active company OWNER approval reference';
  END IF;
  -- Same company lock as every financial writer; insertion wins or waits for
  -- the complete posting transaction, including its source, audit and receipt.
  SELECT currency INTO base FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
  IF base IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Currency policy must match the ledger currency; FX is unsupported';
  END IF;
  SELECT * INTO prior FROM private.aqvora_currency_policies
    WHERE organization_id=NEW.organization_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision IS DISTINCT FROM coalesce(prior.revision,0)+1
    OR (prior.revision IS NOT NULL AND (NEW.effective_from<=prior.effective_from
      OR NEW.currency<>prior.currency OR NEW.exponent<>prior.exponent)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Stale currency revision or incompatible book units; approved cutover required';
  END IF;
  SELECT max(business_date) INTO latest FROM (
    SELECT business_date FROM public.aqvora_journals WHERE organization_id=NEW.organization_id
    UNION ALL SELECT business_date FROM public.aqvora_sales_invoices WHERE organization_id=NEW.organization_id
    UNION ALL SELECT business_date FROM public.aqvora_cash_collections WHERE organization_id=NEW.organization_id
    UNION ALL SELECT business_date FROM public.aqvora_customer_receipts WHERE organization_id=NEW.organization_id
  ) dates;
  IF (prior.revision IS NULL AND latest IS NOT NULL) OR NEW.effective_from<=latest THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Currency policy cannot reinterpret existing sources; approved cutover required';
  END IF;
  NEW.fingerprint := private.aqvora_currency_fingerprint(NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_currency_policy_guard BEFORE INSERT OR UPDATE OR DELETE
  ON private.aqvora_currency_policies FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_policy_guard();
CREATE TRIGGER aqvora_currency_policy_no_truncate BEFORE TRUNCATE
  ON private.aqvora_currency_policies FOR EACH STATEMENT EXECUTE FUNCTION private.aqvora_immutable();
REVOKE ALL ON FUNCTION private.aqvora_currency_policy_guard() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.aqvora_journals ADD COLUMN currency_policy_revision bigint,
  ADD FOREIGN KEY (organization_id,currency_policy_revision) REFERENCES private.aqvora_currency_policies(organization_id,revision);
ALTER TABLE public.aqvora_sales_invoices ADD COLUMN currency_policy_revision bigint,
  ADD FOREIGN KEY (organization_id,currency_policy_revision) REFERENCES private.aqvora_currency_policies(organization_id,revision);
ALTER TABLE public.aqvora_cash_collections ADD COLUMN currency_policy_revision bigint,
  ADD FOREIGN KEY (organization_id,currency_policy_revision) REFERENCES private.aqvora_currency_policies(organization_id,revision);
ALTER TABLE public.aqvora_customer_receipts ADD COLUMN currency_policy_revision bigint,
  ADD FOREIGN KEY (organization_id,currency_policy_revision) REFERENCES private.aqvora_currency_policies(organization_id,revision);

CREATE FUNCTION private.aqvora_currency_json(p private.aqvora_currency_policies) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' SET datestyle='ISO,YMD' AS $$
BEGIN
  IF p.fingerprint IS DISTINCT FROM private.aqvora_currency_fingerprint(p) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Currency policy fingerprint is inconsistent';
  END IF;
  RETURN jsonb_build_object('contract_version','aqvora-currency-policy-v1','status','configured',
    'organization_id',p.organization_id,'transaction_currency',p.currency,'ledger_currency',p.currency,
    'currency_exponent',p.exponent,'minor_units_per_major','1'||repeat('0',p.exponent),
    'display_decimal_places',p.exponent,'revision',p.revision::text,'effective_from',p.effective_from,
    'fingerprint',p.fingerprint,'provenance',jsonb_build_object('kind','trusted_company_accounting_policy',
      'authority_reference',p.authority_reference,'authority_revision',p.authority_revision,
      'approval_reference',p.approval_reference,'approved_by',p.approved_by),
    'source_rounding','quantity_millionths_half_up_per_line_v1','fx_supported',false);
END $$;
CREATE FUNCTION private.aqvora_currency_at(p_org uuid,p_date date,p_currency text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE policy private.aqvora_currency_policies;
BEGIN
  IF p_date IS NULL OR p_date NOT BETWEEN date '0001-01-01' AND date '9999-12-31'
    OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org AND currency=p_currency) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid company currency or policy date';
  END IF;
  SELECT * INTO policy FROM private.aqvora_currency_policies WHERE organization_id=p_org
    AND currency=p_currency AND effective_from<=p_date ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN private.aqvora_currency_json(policy);
END $$;
CREATE FUNCTION private.aqvora_currency_bound(p_org uuid,p_revision bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.aqvora_currency_json(p) FROM private.aqvora_currency_policies p
    WHERE p.organization_id=p_org AND p.revision=p_revision;
$$;
CREATE FUNCTION private.aqvora_currency_bind() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE policy jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Currency-bound financial mutations require READ COMMITTED';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR SHARE;
  IF TG_OP='UPDATE' THEN
    IF NEW.currency_policy_revision IS DISTINCT FROM OLD.currency_policy_revision THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Source currency revision is immutable';
    END IF;
    -- Old unconfigured documents can be cancelled, never approved or posted.
    IF NEW.state='cancelled' THEN RETURN NEW; END IF;
  END IF;
  policy := private.aqvora_currency_at(NEW.organization_id,NEW.business_date,NEW.currency);
  IF policy IS NULL OR (TG_OP='UPDATE' AND
    NEW.currency_policy_revision IS DISTINCT FROM (policy->>'revision')::bigint) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Currency policy is unconfigured or source revision is stale';
  END IF;
  IF TG_OP='INSERT' AND NEW.currency_policy_revision IS NOT NULL
    AND NEW.currency_policy_revision<>(policy->>'revision')::bigint THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Contradictory source currency policy';
  END IF;
  NEW.currency_policy_revision := (policy->>'revision')::bigint;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_currency_bind BEFORE INSERT OR UPDATE ON public.aqvora_sales_invoices
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_bind();
CREATE TRIGGER aqvora_currency_bind BEFORE INSERT OR UPDATE ON public.aqvora_cash_collections
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_bind();
CREATE TRIGGER aqvora_currency_bind BEFORE INSERT OR UPDATE ON public.aqvora_customer_receipts
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_bind();
-- Journals have no lifecycle state and are immutable; bind only new inserts.
CREATE TRIGGER aqvora_currency_bind BEFORE INSERT ON public.aqvora_journals
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_bind();
REVOKE ALL ON FUNCTION private.aqvora_currency_json(private.aqvora_currency_policies),
  private.aqvora_currency_at(uuid,date,text),private.aqvora_currency_bound(uuid,bigint),
  private.aqvora_currency_bind() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.aqvora_currency_book_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency AND EXISTS(
    SELECT 1 FROM private.aqvora_currency_policies WHERE organization_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Configured V2 book currency is immutable; approved cutover required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_currency_book_guard BEFORE UPDATE OF currency ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_currency_book_guard();
REVOKE ALL ON FUNCTION private.aqvora_currency_book_guard() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.read_aqvora_currency_policy(p_organization_id uuid,p_currency text,p_as_of_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE policy jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  policy := private.aqvora_currency_at(p_organization_id,p_as_of_date,p_currency);
  RETURN jsonb_build_object('contract_version','aqvora-currency-read-v1','organization_id',p_organization_id,
    'transaction_currency',p_currency,'ledger_currency',p_currency,'as_of_date',p_as_of_date,
    'status',CASE WHEN policy IS NULL THEN 'unconfigured' ELSE 'configured' END,
    'display_complete',policy IS NOT NULL,'policy',policy);
END $$;
REVOKE ALL ON FUNCTION public.read_aqvora_currency_policy(uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_aqvora_currency_policy(uuid,text,date) TO authenticated;
