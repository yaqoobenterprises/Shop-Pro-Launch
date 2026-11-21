-- AQVORA V2 new-tenant provenance. EMPTY by design: not a legacy-company
-- backfill and not an activation migration. No existing business is enrolled.
--
-- Every eligible organization MUST originate in the trusted atomic
-- create_aqvora_fresh_company RPC, with a DB-generated UUID. Legacy Shop Pro's
-- signup trigger seeds a Cash Drawer; it cannot establish fresh V2 provenance.
CREATE TABLE private.aqvora_fresh_company_origins (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  creator_id uuid NOT NULL REFERENCES auth.users(id),
  creation_intent uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  company_name text NOT NULL CHECK (length(btrim(company_name)) BETWEEN 1 AND 255),
  country_name text NOT NULL CHECK (length(btrim(country_name)) BETWEEN 2 AND 100),
  company_timezone text NOT NULL CHECK (length(btrim(company_timezone)) BETWEEN 1 AND 100),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  registration_method text NOT NULL DEFAULT 'aqvora_fresh_v2_rpc_20261121'
    CHECK (registration_method='aqvora_fresh_v2_rpc_20261121'),
  UNIQUE(creator_id,creation_intent)
);
CREATE TABLE private.aqvora_finance_activation_requests (
  organization_id uuid NOT NULL REFERENCES private.aqvora_fresh_company_origins(organization_id),
  maker_intent uuid NOT NULL,
  maker_id uuid NOT NULL REFERENCES auth.users(id),
  maker_session_id uuid NOT NULL,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  fiscal_period_id uuid NOT NULL,
  currency_policy_revision bigint NOT NULL CHECK (currency_policy_revision>0),
  currency_policy_fingerprint text NOT NULL
    CHECK (currency_policy_fingerprint ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 500),
  proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,maker_intent)
);
CREATE TABLE private.aqvora_finance_activation_approvals (
  organization_id uuid NOT NULL REFERENCES private.aqvora_fresh_company_origins(organization_id),
  checker_intent uuid NOT NULL,
  maker_intent uuid NOT NULL,
  checker_id uuid NOT NULL REFERENCES auth.users(id),
  checker_session_id uuid NOT NULL,
  approved_evidence_hash text NOT NULL CHECK (approved_evidence_hash ~ '^[0-9a-f]{64}$'),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,checker_intent),
  UNIQUE(organization_id,maker_intent),
  FOREIGN KEY (organization_id,maker_intent)
    REFERENCES private.aqvora_finance_activation_requests(organization_id,maker_intent)
);

-- Do not expose any invitation/enrollment or direct activation DML to clients.
ALTER TABLE private.aqvora_fresh_company_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_finance_activation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_finance_activation_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.aqvora_fresh_company_origins,
  private.aqvora_finance_activation_requests,
  private.aqvora_finance_activation_approvals FROM PUBLIC, anon, authenticated;

CREATE TRIGGER aqvora_origin_immutable BEFORE UPDATE OR DELETE
  ON private.aqvora_fresh_company_origins FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_request_immutable BEFORE UPDATE OR DELETE
  ON private.aqvora_finance_activation_requests FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_approval_immutable BEFORE UPDATE OR DELETE
  ON private.aqvora_finance_activation_approvals FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_immutable();

-- A freshly created V2 company must NEVER be handled by the old Cashbook
-- source ledger, whose old signup/default routines can seed fictional funds.
-- This guard only matches organizations originating from the NEW RPC.
CREATE FUNCTION private.aqvora_block_legacy_fresh_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM private.aqvora_fresh_company_origins
    WHERE organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Fresh AQVORA company cannot write to the legacy Cashbook';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_block_legacy_fresh_writes()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER aqvora_fresh_no_legacy_tx BEFORE INSERT OR UPDATE
  ON public.transactions FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_drafts BEFORE INSERT OR UPDATE
  ON public.transaction_drafts FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_payment_accounts BEFORE INSERT OR UPDATE
  ON public.payment_accounts FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_account_ledger BEFORE INSERT OR UPDATE
  ON public.account_ledger_entries FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_transfers BEFORE INSERT OR UPDATE
  ON public.account_transfers FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_stock BEFORE INSERT OR UPDATE
  ON public.stock_movements FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_account_tx BEFORE INSERT OR UPDATE
  ON public.account_transactions FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();

-- Include the original Shop Pro POS, stock, expense and closing subsystems.
-- Some tables carry legacy opening stock, receivables or cash separately from
-- transactions; ignoring them would falsely certify zero V2 history.
CREATE TRIGGER aqvora_fresh_no_legacy_products BEFORE INSERT OR UPDATE
  ON public.products FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_services BEFORE INSERT OR UPDATE
  ON public.services FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_customers BEFORE INSERT OR UPDATE
  ON public.customers FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_expenses BEFORE INSERT OR UPDATE
  ON public.expenses FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_sales BEFORE INSERT OR UPDATE
  ON public.sales FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_sale_items BEFORE INSERT OR UPDATE
  ON public.sale_items FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_daily_close BEFORE INSERT OR UPDATE
  ON public.daily_closings FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
CREATE TRIGGER aqvora_fresh_no_legacy_review_queue BEFORE INSERT OR UPDATE
  ON public.review_queue FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_block_legacy_fresh_writes();
