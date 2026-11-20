-- Operational sources only. Both enrollment and trusted policy remain empty.
CREATE TABLE public.aqvora_customers (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(organization_id,id)
);
CREATE UNIQUE INDEX aqvora_customer_code ON public.aqvora_customers(organization_id,upper(code));

CREATE TABLE private.aqvora_sales_policies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  revision bigint NOT NULL CHECK (revision > 0),
  is_active boolean NOT NULL DEFAULT false,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  jurisdiction text NOT NULL CHECK (length(btrim(jurisdiction)) BETWEEN 1 AND 100),
  tax_treatment text NOT NULL CHECK (tax_treatment = 'verified_out_of_scope'),
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 1 AND 500),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  starts_on date NOT NULL, ends_on date NOT NULL CHECK (ends_on >= starts_on),
  ar_account_id uuid NOT NULL, revenue_account_id uuid NOT NULL,
  FOREIGN KEY(organization_id,ar_account_id) REFERENCES public.aqvora_accounts(organization_id,id),
  FOREIGN KEY(organization_id,revenue_account_id) REFERENCES public.aqvora_accounts(organization_id,id),
  CHECK (ar_account_id <> revenue_account_id)
);
CREATE TABLE private.aqvora_sales_numbers (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  last_number bigint NOT NULL CHECK (last_number > 0)
);

CREATE TABLE public.aqvora_sales_invoices (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_intent text NOT NULL CHECK (length(creation_intent) BETWEEN 1 AND 100 AND creation_intent=btrim(creation_intent)),
  creation_request jsonb NOT NULL,
  customer_id uuid NOT NULL, business_date date NOT NULL, due_date date NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 100),
  gross_minor bigint NOT NULL CHECK (gross_minor > 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  face_minor bigint NOT NULL CHECK (face_minor > 0 AND face_minor=gross_minor-discount_minor),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','issued','cancelled')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  customer_snapshot jsonb, policy_snapshot jsonb, fingerprint text,
  journal_id uuid, document_number bigint CHECK (document_number > 0),
  cancel_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,id), UNIQUE(organization_id,creation_intent),
  UNIQUE(organization_id,document_number), UNIQUE(organization_id,journal_id),
  FOREIGN KEY(organization_id,customer_id) REFERENCES public.aqvora_customers(organization_id,id),
  FOREIGN KEY(organization_id,journal_id) REFERENCES public.aqvora_journals(organization_id,id),
  CHECK (business_date BETWEEN date '0001-01-01' AND date '9999-12-31' AND due_date BETWEEN business_date AND date '9999-12-31'),
  CHECK ((state='issued') = (journal_id IS NOT NULL AND document_number IS NOT NULL)),
  CHECK (state='issued' OR (journal_id IS NULL AND document_number IS NULL)),
  CHECK (state NOT IN ('approved','issued') OR (approved_by IS NOT NULL AND approved_by <> created_by)),
  CHECK (state NOT IN ('submitted','approved','issued') OR
    (customer_snapshot IS NOT NULL AND policy_snapshot IS NOT NULL AND fingerprint IS NOT NULL)),
  CHECK (state<>'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 1 AND 500))
);
CREATE TABLE public.aqvora_sales_issue_receipts (
  organization_id uuid NOT NULL,
  intent_key text NOT NULL CHECK (length(intent_key) BETWEEN 1 AND 100 AND intent_key=btrim(intent_key)),
  invoice_id uuid NOT NULL, journal_id uuid NOT NULL,
  request jsonb NOT NULL, response jsonb NOT NULL,
  PRIMARY KEY(organization_id,intent_key), UNIQUE(organization_id,invoice_id), UNIQUE(organization_id,journal_id),
  FOREIGN KEY(organization_id,invoice_id) REFERENCES public.aqvora_sales_invoices(organization_id,id),
  FOREIGN KEY(organization_id,journal_id) REFERENCES public.aqvora_journals(organization_id,id)
);
CREATE INDEX aqvora_sales_issued_date ON public.aqvora_sales_invoices(organization_id,business_date,id) WHERE state='issued';
CREATE INDEX aqvora_sales_customer_reference ON public.aqvora_sales_invoices(organization_id,customer_id);
CREATE TABLE public.aqvora_sales_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('customer','invoice')),
  entity_id uuid NOT NULL, revision bigint NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('CREATE','EDIT','SUBMIT','APPROVE','REJECT','CANCEL','ISSUE','ARCHIVE')),
  actor_id uuid NOT NULL REFERENCES auth.users(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text, before_row jsonb, after_row jsonb NOT NULL,
  UNIQUE(organization_id,entity_type,entity_id,revision)
);

ALTER TABLE public.aqvora_journals
  ADD COLUMN source_kind text, ADD COLUMN source_id uuid,
  ADD COLUMN source_revision bigint, ADD COLUMN source_fingerprint text,
  ADD CONSTRAINT aqvora_journal_sales_source_fk FOREIGN KEY(organization_id,source_id)
    REFERENCES public.aqvora_sales_invoices(organization_id,id),
  ADD CONSTRAINT aqvora_journal_source_shape CHECK (
    (source_kind IS NULL AND source_id IS NULL AND source_revision IS NULL AND source_fingerprint IS NULL) OR
    coalesce(source_kind='sales_invoice' AND source_id IS NOT NULL AND source_revision > 0
      AND source_fingerprint ~ '^[0-9a-f]{64}$',false));
CREATE UNIQUE INDEX aqvora_journal_one_sales_source ON public.aqvora_journals(organization_id,source_kind,source_id)
  WHERE source_kind IS NOT NULL;

CREATE FUNCTION private.aqvora_sales_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.state IN ('issued','cancelled') THEN
    RAISE EXCEPTION 'Sales history is immutable; issued credits/refunds are unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_sales_history BEFORE UPDATE OR DELETE ON public.aqvora_sales_invoices
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_sales_history_guard();
CREATE TRIGGER aqvora_sales_receipt_immutable BEFORE UPDATE OR DELETE ON public.aqvora_sales_issue_receipts
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_sales_audit_immutable BEFORE UPDATE OR DELETE ON public.aqvora_sales_audit
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE FUNCTION private.aqvora_block_sales_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.reversal_of IS NOT NULL AND EXISTS (SELECT 1 FROM public.aqvora_journals j
    WHERE j.organization_id=NEW.organization_id AND j.id=NEW.reversal_of AND j.source_kind='sales_invoice') THEN
    RAISE EXCEPTION 'Issued sales invoices require a linked credit workflow; unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_block_sales_reversal BEFORE INSERT ON public.aqvora_journals
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_block_sales_reversal();

ALTER TABLE public.aqvora_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_sales_issue_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_sales_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_sales_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_sales_numbers ENABLE ROW LEVEL SECURITY;
-- RPC-only source access also avoids exposing BIGINT JSON numbers to browsers.
REVOKE ALL ON public.aqvora_customers,public.aqvora_sales_invoices,
  public.aqvora_sales_issue_receipts,public.aqvora_sales_audit,
  private.aqvora_sales_policies,private.aqvora_sales_numbers FROM PUBLIC,anon,authenticated;
CREATE POLICY aqvora_customer_read ON public.aqvora_customers FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_sales_read ON public.aqvora_sales_invoices FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_sales_receipt_read ON public.aqvora_sales_issue_receipts FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_sales_audit_read ON public.aqvora_sales_audit FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
REVOKE ALL ON FUNCTION private.aqvora_sales_history_guard(),private.aqvora_block_sales_reversal()
  FROM PUBLIC,anon,authenticated;
