-- V2 administration remains isolated from legacy accounts and cashbook tables.
ALTER TABLE public.aqvora_accounts
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE public.aqvora_periods
  ADD COLUMN reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

-- An archived heading must not acquire new active descendants after archive.
CREATE FUNCTION private.aqvora_active_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    PERFORM 1 FROM public.aqvora_accounts
      WHERE organization_id = NEW.organization_id AND id = NEW.parent_id
        AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Chart parent must be active'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_account_active_parent
  BEFORE INSERT OR UPDATE OF parent_id, organization_id, is_active
  ON public.aqvora_accounts FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_active_parent();
REVOKE ALL ON FUNCTION private.aqvora_active_parent() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.aqvora_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('account','period')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN
    ('ACCOUNT_CREATE','ACCOUNT_EDIT','ACCOUNT_ARCHIVE',
     'PERIOD_CREATE','PERIOD_CLOSE','PERIOD_REOPEN')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  before_row jsonb,
  after_row jsonb
);
REVOKE ALL ON public.aqvora_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aqvora_admin_audit TO authenticated;
ALTER TABLE public.aqvora_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY aqvora_admin_audit_read ON public.aqvora_admin_audit
  FOR SELECT TO authenticated
  USING (private.aqvora_can_read(organization_id));
CREATE TRIGGER aqvora_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON public.aqvora_admin_audit
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_immutable();

-- Even privileged maintenance must preserve historical account classification
-- and hierarchy when any descendant has posted journal lines.
CREATE FUNCTION private.aqvora_protect_account_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE has_posted boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Archive AQVORA accounts; do not delete'; END IF;
  IF OLD.control_role IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Control accounts are protected';
  END IF;
  IF (NEW.organization_id, NEW.id, NEW.code, NEW.account_class,
      NEW.normal_side, NEW.parent_id, NEW.is_posting, NEW.control_role)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.id, OLD.code, OLD.account_class,
      OLD.normal_side, OLD.parent_id, OLD.is_posting, OLD.control_role) THEN
    WITH RECURSIVE subtree(id) AS (
      SELECT OLD.id
      UNION
      SELECT child.id FROM public.aqvora_accounts child
        JOIN subtree parent ON child.parent_id = parent.id
        WHERE child.organization_id = OLD.organization_id
    ) SELECT EXISTS (
      SELECT 1 FROM public.aqvora_journal_lines line
      JOIN subtree ON subtree.id = line.account_id
      WHERE line.organization_id = OLD.organization_id
    ) INTO has_posted;
    IF has_posted THEN
      RAISE EXCEPTION 'Posted account hierarchy and classification are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_account_history_guard
  BEFORE UPDATE OR DELETE ON public.aqvora_accounts
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_protect_account_history();
REVOKE ALL ON FUNCTION private.aqvora_protect_account_history() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.aqvora_no_period_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'AQVORA fiscal periods cannot be deleted';
END $$;
CREATE TRIGGER aqvora_period_delete_guard
  BEFORE DELETE ON public.aqvora_periods
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_no_period_delete();
REVOKE ALL ON FUNCTION private.aqvora_no_period_delete() FROM PUBLIC, anon, authenticated;

-- Auth, session and membership locks come first, then an exclusive company
-- lock. Posting takes the same lock in shared mode before period/account locks.
CREATE FUNCTION private.aqvora_admin_authorize(p_org uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid;
BEGIN
  actor := private.aqvora_authorize(p_org);
  PERFORM 1 FROM public.organization_members
    WHERE organization_id = p_org AND user_id = actor
      AND is_active AND role = 'OWNER' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AQVORA administration requires an active owner'; END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company is missing'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_admin_authorize(uuid) FROM PUBLIC, anon, authenticated;
