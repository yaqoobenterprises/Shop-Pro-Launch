-- No policy or enrollment is seeded. Controlled cash only; no bank-feed claims.
CREATE TABLE private.aqvora_receipt_policies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  revision bigint NOT NULL CHECK(revision>0), is_active boolean NOT NULL DEFAULT false,
  source_kind text NOT NULL CHECK(source_kind='controlled_cash'),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  cash_account_id uuid NOT NULL, ar_account_id uuid NOT NULL,
  starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>=starts_on),
  evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 1 AND 500),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  FOREIGN KEY(organization_id,cash_account_id) REFERENCES public.aqvora_accounts(organization_id,id),
  FOREIGN KEY(organization_id,ar_account_id) REFERENCES public.aqvora_accounts(organization_id,id),
  CHECK(cash_account_id<>ar_account_id)
);
CREATE TABLE private.aqvora_receipt_numbers (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  kind text NOT NULL CHECK(kind IN ('collection','receipt')), last_number bigint NOT NULL CHECK(last_number>0),
  PRIMARY KEY(organization_id,kind)
);
CREATE TABLE public.aqvora_cash_collections (
  organization_id uuid NOT NULL REFERENCES public.organizations(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_intent text NOT NULL CHECK(length(creation_intent) BETWEEN 1 AND 100 AND creation_intent=btrim(creation_intent)),
  creation_request jsonb NOT NULL, collection_number bigint NOT NULL CHECK(collection_number>0),
  customer_id uuid NOT NULL, business_date date NOT NULL, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK(amount_minor>0), state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','cancelled')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid NOT NULL REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id), maker_session_fingerprint text NOT NULL,
  checker_session_fingerprint text, customer_snapshot jsonb, policy_snapshot jsonb, fingerprint text,
  cancel_reason text, created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  PRIMARY KEY(organization_id,id), UNIQUE(organization_id,creation_intent), UNIQUE(organization_id,collection_number),
  FOREIGN KEY(organization_id,customer_id) REFERENCES public.aqvora_customers(organization_id,id),
  CHECK(business_date BETWEEN date '0001-01-01' AND date '9999-12-31'),
  CHECK(state<>'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_by<>created_by AND confirmed_at IS NOT NULL
    AND checker_session_fingerprint IS NOT NULL AND customer_snapshot IS NOT NULL AND policy_snapshot IS NOT NULL AND fingerprint IS NOT NULL)),
  CHECK(state<>'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 1 AND 500))
);
CREATE TABLE public.aqvora_customer_receipts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_intent text NOT NULL CHECK(length(creation_intent) BETWEEN 1 AND 100 AND creation_intent=btrim(creation_intent)),
  creation_request jsonb NOT NULL, collection_id uuid NOT NULL, collection_fingerprint text NOT NULL,
  customer_id uuid NOT NULL, business_date date NOT NULL, currency text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0), allocations jsonb NOT NULL
    CHECK(jsonb_typeof(allocations)='array' AND jsonb_array_length(allocations) BETWEEN 1 AND 99),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','posted','cancelled')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id), policy_snapshot jsonb, fingerprint text,
  journal_id uuid, receipt_number bigint CHECK(receipt_number>0), cancel_reason text,
  PRIMARY KEY(organization_id,id), UNIQUE(organization_id,creation_intent), UNIQUE(organization_id,receipt_number),
  UNIQUE(organization_id,journal_id),
  FOREIGN KEY(organization_id,collection_id) REFERENCES public.aqvora_cash_collections(organization_id,id),
  FOREIGN KEY(organization_id,customer_id) REFERENCES public.aqvora_customers(organization_id,id),
  FOREIGN KEY(organization_id,journal_id) REFERENCES public.aqvora_journals(organization_id,id),
  CHECK((state='posted')=(journal_id IS NOT NULL AND receipt_number IS NOT NULL)),
  CHECK(state='posted' OR (journal_id IS NULL AND receipt_number IS NULL)),
  CHECK(state NOT IN ('submitted','approved','posted') OR (policy_snapshot IS NOT NULL AND fingerprint IS NOT NULL)),
  CHECK(state NOT IN ('approved','posted') OR (approved_by IS NOT NULL AND approved_by<>created_by)),
  CHECK(state<>'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 1 AND 500))
);
CREATE UNIQUE INDEX aqvora_one_live_receipt_instrument ON public.aqvora_customer_receipts(organization_id,collection_id)
  WHERE state<>'cancelled';
CREATE INDEX aqvora_receipts_customer_date ON public.aqvora_customer_receipts(organization_id,customer_id,business_date,id) WHERE state='posted';
-- Independent source lookup catches a deleted allocation without scanning all
-- receipt history for each invoice. Company ownership is still checked first.
CREATE INDEX aqvora_receipts_invoice_sources ON public.aqvora_customer_receipts USING gin(allocations jsonb_path_ops) WHERE state='posted';
CREATE INDEX aqvora_journals_company_currency ON public.aqvora_journals(organization_id,currency);
CREATE INDEX aqvora_collections_customer ON public.aqvora_cash_collections(organization_id,customer_id,id);
CREATE TABLE public.aqvora_receipt_allocations (
  organization_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL,
  invoice_id uuid NOT NULL, invoice_revision bigint NOT NULL, invoice_fingerprint text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0), journal_id uuid NOT NULL, line_no integer NOT NULL CHECK(line_no BETWEEN 2 AND 100),
  PRIMARY KEY(organization_id,id), UNIQUE(organization_id,receipt_id,invoice_id), UNIQUE(organization_id,journal_id,line_no),
  FOREIGN KEY(organization_id,receipt_id) REFERENCES public.aqvora_customer_receipts(organization_id,id),
  FOREIGN KEY(organization_id,invoice_id) REFERENCES public.aqvora_sales_invoices(organization_id,id),
  FOREIGN KEY(organization_id,journal_id,line_no) REFERENCES public.aqvora_journal_lines(organization_id,journal_id,line_no)
);
CREATE INDEX aqvora_allocations_invoice ON public.aqvora_receipt_allocations(organization_id,invoice_id,receipt_id);
CREATE TABLE public.aqvora_receipt_issues (
  organization_id uuid NOT NULL, intent_key text NOT NULL CHECK(length(intent_key) BETWEEN 1 AND 100 AND intent_key=btrim(intent_key)),
  receipt_id uuid NOT NULL, journal_id uuid NOT NULL, request jsonb NOT NULL, response jsonb NOT NULL,
  PRIMARY KEY(organization_id,intent_key), UNIQUE(organization_id,receipt_id), UNIQUE(organization_id,journal_id),
  FOREIGN KEY(organization_id,receipt_id) REFERENCES public.aqvora_customer_receipts(organization_id,id),
  FOREIGN KEY(organization_id,journal_id) REFERENCES public.aqvora_journals(organization_id,id)
);
CREATE TABLE public.aqvora_receipt_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_type text NOT NULL CHECK(entity_type IN ('collection','receipt')), entity_id uuid NOT NULL,
  revision bigint NOT NULL CHECK(revision>0), action text NOT NULL
    CHECK(action IN ('CREATE','CONFIRM','EDIT','SUBMIT','APPROVE','REJECT','CANCEL','POST')),
  actor_id uuid NOT NULL REFERENCES auth.users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  before_row jsonb, after_row jsonb NOT NULL, reason text,
  UNIQUE(organization_id,entity_type,entity_id,revision)
);

-- Typed generated references preserve the invoice FK and add an equally strict
-- receipt FK. No journal amounts/history are updated; old read tokens restart.
ALTER TABLE public.aqvora_journals DROP CONSTRAINT aqvora_journal_sales_source_fk,
  DROP CONSTRAINT aqvora_journal_source_shape,
  ADD COLUMN sales_source_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='sales_invoice' THEN source_id END) STORED,
  ADD COLUMN receipt_source_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='customer_receipt' THEN source_id END) STORED,
  ADD FOREIGN KEY(organization_id,sales_source_id) REFERENCES public.aqvora_sales_invoices(organization_id,id),
  ADD FOREIGN KEY(organization_id,receipt_source_id) REFERENCES public.aqvora_customer_receipts(organization_id,id),
  ADD CONSTRAINT aqvora_journal_source_shape CHECK(
    (source_kind IS NULL AND source_id IS NULL AND source_revision IS NULL AND source_fingerprint IS NULL) OR
    coalesce(source_kind IN ('sales_invoice','customer_receipt') AND source_id IS NOT NULL AND source_revision>0
      AND source_fingerprint ~ '^[0-9a-f]{64}$',false));

CREATE FUNCTION private.aqvora_receipt_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.state IN ('confirmed','posted','cancelled') THEN
    RAISE EXCEPTION 'Confirmed cash and posted receipt history are immutable; refunds are unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_collection_history BEFORE UPDATE OR DELETE ON public.aqvora_cash_collections
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_receipt_history_guard();
CREATE TRIGGER aqvora_receipt_history BEFORE UPDATE OR DELETE ON public.aqvora_customer_receipts
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_receipt_history_guard();
CREATE TRIGGER aqvora_allocation_immutable BEFORE UPDATE OR DELETE ON public.aqvora_receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_receipt_issue_immutable BEFORE UPDATE OR DELETE ON public.aqvora_receipt_issues
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_receipt_audit_immutable BEFORE UPDATE OR DELETE ON public.aqvora_receipt_audit
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE OR REPLACE FUNCTION private.aqvora_block_sales_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.reversal_of IS NOT NULL AND EXISTS(SELECT 1 FROM public.aqvora_journals j
    WHERE j.organization_id=NEW.organization_id AND j.id=NEW.reversal_of AND j.source_kind IN ('sales_invoice','customer_receipt')) THEN
    RAISE EXCEPTION 'Source-backed invoices/receipts require a linked credit/refund workflow; unavailable'; END IF;
  RETURN NEW;
END $$;
ALTER TABLE private.aqvora_receipt_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_receipt_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_cash_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_receipt_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_receipt_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.aqvora_receipt_policies,private.aqvora_receipt_numbers,public.aqvora_cash_collections,
  public.aqvora_customer_receipts,public.aqvora_receipt_allocations,public.aqvora_receipt_issues,public.aqvora_receipt_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.aqvora_receipt_audit_id_seq FROM PUBLIC,anon,authenticated;
CREATE POLICY aqvora_collection_read ON public.aqvora_cash_collections FOR SELECT TO authenticated USING(private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_receipt_read ON public.aqvora_customer_receipts FOR SELECT TO authenticated USING(private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_allocation_read ON public.aqvora_receipt_allocations FOR SELECT TO authenticated USING(private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_receipt_issue_read ON public.aqvora_receipt_issues FOR SELECT TO authenticated USING(private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_receipt_audit_read ON public.aqvora_receipt_audit FOR SELECT TO authenticated USING(private.aqvora_can_read(organization_id));
REVOKE ALL ON FUNCTION private.aqvora_receipt_history_guard() FROM PUBLIC,anon,authenticated;
