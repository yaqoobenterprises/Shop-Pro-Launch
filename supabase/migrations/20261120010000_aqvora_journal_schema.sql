-- Isolated V2 ledger. No legacy writer, balance, or customer table is changed.
CREATE TABLE public.aqvora_accounts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  account_class text NOT NULL CHECK (account_class IN
    ('asset','liability','equity','revenue','cost_of_sales','expense','other_income','other_expense')),
  normal_side text NOT NULL CHECK (normal_side IN ('debit','credit')),
  parent_id uuid,
  is_posting boolean NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  control_role text CHECK (control_role IN ('cash','receivable','payable','inventory','tax')),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, parent_id)
    REFERENCES public.aqvora_accounts(organization_id, id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (control_role IS NULL OR is_posting),
  CHECK (control_role IS DISTINCT FROM 'receivable' OR account_class = 'asset'),
  CHECK (control_role IS DISTINCT FROM 'payable' OR account_class = 'liability'),
  CHECK (control_role IS DISTINCT FROM 'inventory' OR account_class = 'asset'),
  CHECK (control_role IS DISTINCT FROM 'cash' OR account_class = 'asset'),
  CHECK (control_role IS DISTINCT FROM 'tax' OR account_class IN ('asset','liability'))
);
CREATE UNIQUE INDEX aqvora_accounts_code_key
  ON public.aqvora_accounts(organization_id, upper(code));

CREATE FUNCTION private.aqvora_check_account_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent_class text; parent_posting boolean; ancestor_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.aqvora_journal_lines l
    WHERE l.organization_id = OLD.organization_id AND l.account_id = OLD.id)
    AND (NEW.organization_id, NEW.id, NEW.code, NEW.account_class, NEW.normal_side,
         NEW.parent_id, NEW.is_posting, NEW.control_role)
      IS DISTINCT FROM
        (OLD.organization_id, OLD.id, OLD.code, OLD.account_class, OLD.normal_side,
         OLD.parent_id, OLD.is_posting, OLD.control_role) THEN
    RAISE EXCEPTION 'Posted chart account classification is immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.aqvora_accounts child
    WHERE child.organization_id = NEW.organization_id AND child.parent_id = NEW.id
      AND (NEW.is_posting OR child.account_class <> NEW.account_class)) THEN
    RAISE EXCEPTION 'Chart heading with children cannot become a posting account or change class';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT account_class, is_posting INTO parent_class, parent_posting
    FROM public.aqvora_accounts
    WHERE organization_id = NEW.organization_id AND id = NEW.parent_id;
    IF NOT FOUND OR parent_posting OR parent_class <> NEW.account_class THEN
      RAISE EXCEPTION 'Invalid chart parent';
    END IF;
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, ARRAY[id] AS seen FROM public.aqvora_accounts
        WHERE organization_id = NEW.organization_id AND id = NEW.parent_id
      UNION ALL
      SELECT a.id, a.parent_id, ancestors.seen || a.id
        FROM public.aqvora_accounts a JOIN ancestors ON a.id = ancestors.parent_id
        WHERE a.organization_id = NEW.organization_id AND NOT a.id = ANY(ancestors.seen)
    ) SELECT id INTO ancestor_id FROM ancestors WHERE id = NEW.id LIMIT 1;
    IF ancestor_id IS NOT NULL THEN RAISE EXCEPTION 'Chart parent cycle'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_account_parent BEFORE INSERT OR UPDATE ON public.aqvora_accounts
FOR EACH ROW EXECUTE FUNCTION private.aqvora_check_account_parent();

CREATE TABLE public.aqvora_periods (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  state text NOT NULL CHECK (state IN ('open','closed')),
  PRIMARY KEY (organization_id, id),
  CHECK (starts_on <= ends_on),
  UNIQUE (organization_id, starts_on, ends_on)
);

CREATE FUNCTION private.aqvora_check_period_overlap() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Lock the company row so concurrent period edits cannot both pass the check.
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.aqvora_journals j
    WHERE j.organization_id = OLD.organization_id AND j.period_id = OLD.id) THEN
    RAISE EXCEPTION 'Posted fiscal period boundaries are immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.aqvora_periods p
    WHERE p.organization_id = NEW.organization_id AND p.id <> NEW.id
      AND p.starts_on <= NEW.ends_on AND p.ends_on >= NEW.starts_on) THEN
    RAISE EXCEPTION 'Fiscal periods cannot overlap';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_period_overlap BEFORE INSERT OR UPDATE OF starts_on, ends_on, organization_id
ON public.aqvora_periods FOR EACH ROW EXECUTE FUNCTION private.aqvora_check_period_overlap();

-- Empty on migration: no existing company can use the new writer by default.
CREATE TABLE public.aqvora_enabled_companies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  enabled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.aqvora_journals (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  intent_key text NOT NULL CHECK (length(intent_key) BETWEEN 1 AND 160),
  business_date date NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  period_id uuid NOT NULL,
  payload jsonb NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  reversal_of uuid,
  reason text,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, intent_key),
  UNIQUE (organization_id, reversal_of),
  FOREIGN KEY (organization_id, period_id)
    REFERENCES public.aqvora_periods(organization_id, id),
  FOREIGN KEY (organization_id, reversal_of)
    REFERENCES public.aqvora_journals(organization_id, id),
  CHECK ((reversal_of IS NULL AND reason IS NULL) OR
         (reversal_of IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500))
);

CREATE TABLE public.aqvora_journal_lines (
  organization_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no > 0),
  account_id uuid NOT NULL,
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  party_id text,
  open_item_id text,
  stock_movement_id text,
  PRIMARY KEY (organization_id, journal_id, line_no),
  FOREIGN KEY (organization_id, journal_id)
    REFERENCES public.aqvora_journals(organization_id, id),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES public.aqvora_accounts(organization_id, id),
  CHECK ((debit_minor > 0) <> (credit_minor > 0))
);

CREATE TABLE public.aqvora_posting_receipts (
  organization_id uuid NOT NULL,
  intent_key text NOT NULL,
  journal_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, intent_key),
  UNIQUE (organization_id, journal_id),
  FOREIGN KEY (organization_id, journal_id)
    REFERENCES public.aqvora_journals(organization_id, id)
);

CREATE TABLE public.aqvora_journal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('POST','REVERSE')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (organization_id, journal_id)
    REFERENCES public.aqvora_journals(organization_id, id)
);

CREATE FUNCTION private.aqvora_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Posted AQVORA financial history is immutable';
END $$;
CREATE TRIGGER aqvora_journal_immutable BEFORE UPDATE OR DELETE ON public.aqvora_journals
FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_lines_immutable BEFORE UPDATE OR DELETE ON public.aqvora_journal_lines
FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_receipts_immutable BEFORE UPDATE OR DELETE ON public.aqvora_posting_receipts
FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_audit_immutable BEFORE UPDATE OR DELETE ON public.aqvora_journal_audit
FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();

-- The old baseline grants future tables to authenticated. Explicitly revoke every
-- writer privilege and expose only company-scoped SELECT through RLS.
REVOKE ALL ON public.aqvora_accounts, public.aqvora_periods,
  public.aqvora_journals, public.aqvora_journal_lines,
  public.aqvora_posting_receipts, public.aqvora_journal_audit,
  public.aqvora_enabled_companies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aqvora_accounts, public.aqvora_periods,
  public.aqvora_journals, public.aqvora_journal_lines,
  public.aqvora_posting_receipts, public.aqvora_journal_audit TO authenticated;

ALTER TABLE public.aqvora_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_enabled_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_posting_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqvora_journal_audit ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.aqvora_can_read(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (auth.jwt()->>'aal') = 'aal2' AND EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      AND s.user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org AND m.user_id = auth.uid()
      AND m.is_active AND m.role IN ('OWNER','MANAGER'));
$$;
REVOKE ALL ON FUNCTION private.aqvora_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.aqvora_can_read(uuid) TO authenticated;

CREATE POLICY aqvora_account_read ON public.aqvora_accounts FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_period_read ON public.aqvora_periods FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_journal_read ON public.aqvora_journals FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_line_read ON public.aqvora_journal_lines FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_receipt_read ON public.aqvora_posting_receipts FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE POLICY aqvora_audit_read ON public.aqvora_journal_audit FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
