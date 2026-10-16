-- Regional Settings, Timezone Aware Posting, Guard Triggers & User Preferences
-- Timestamp: 20261014000000

-- 1. Organizations: region_configured flag and default initialization
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS region_configured BOOLEAN NOT NULL DEFAULT false;

UPDATE public.organizations
SET region_configured = true,
    currency = CASE WHEN currency IS NULL OR currency = '' THEN 'PKR' ELSE currency END,
    timezone = CASE WHEN timezone IS NULL OR timezone = '' THEN 'Asia/Karachi' ELSE timezone END;

-- 2. Timezone-aware business date enforcement trigger
CREATE OR REPLACE FUNCTION public.set_karachi_business_date()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_tz TEXT;
  v_today DATE;
BEGIN
  v_org_id := COALESCE(NEW.organization_id, public.get_auth_org_id());
  IF v_org_id IS NOT NULL THEN
    SELECT timezone INTO v_tz FROM public.organizations WHERE id = v_org_id;
  END IF;

  IF v_tz IS NULL OR v_tz = '' THEN
    v_tz := 'Asia/Karachi';
  END IF;

  BEGIN
    v_today := (NOW() AT TIME ZONE v_tz)::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_today := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
  END;

  IF NEW.business_date IS NULL THEN
    NEW.business_date := v_today;
  ELSIF NEW.business_date > v_today THEN
    RAISE EXCEPTION 'Future business dates are prohibited (% > %)', NEW.business_date, v_today;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger functions do not need direct RPC execution by signed-in users.
REVOKE EXECUTE ON FUNCTION public.set_karachi_business_date() FROM authenticated;

-- 3. Timezone-aware opening balance posting trigger
CREATE OR REPLACE FUNCTION private.record_account_opening_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_tz TEXT;
  v_today DATE;
BEGIN
  IF NEW.balance_paisa > 0 THEN
    SELECT timezone INTO v_tz FROM public.organizations WHERE id = NEW.organization_id;
    IF v_tz IS NULL OR v_tz = '' THEN
      v_tz := 'Asia/Karachi';
    END IF;
    BEGIN
      v_today := (NOW() AT TIME ZONE v_tz)::DATE;
    EXCEPTION WHEN OTHERS THEN
      v_today := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
    END;

    INSERT INTO public.account_ledger_entries (
      organization_id, account_id, entry_type, amount_paisa,
      balance_after_paisa, business_date, created_by
    ) VALUES (
      NEW.organization_id, NEW.id, 'OPENING_BALANCE', NEW.balance_paisa,
      NEW.balance_paisa, v_today, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Timezone-aware account transfer protection trigger
CREATE OR REPLACE FUNCTION private.protect_account_transfer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_tz TEXT;
  v_today DATE;
BEGIN
  IF NEW.from_account_id = NEW.to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than zero';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT timezone INTO v_tz FROM public.organizations WHERE id = NEW.organization_id;
    IF v_tz IS NULL OR v_tz = '' THEN
      v_tz := 'Asia/Karachi';
    END IF;
    BEGIN
      v_today := (NOW() AT TIME ZONE v_tz)::DATE;
    EXCEPTION WHEN OTHERS THEN
      v_today := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
    END;

    NEW.account_posted := TRUE;
    NEW.date := v_today;
  ELSE
    NEW.account_posted := OLD.account_posted;
    IF NEW.status = 'VOIDED' AND COALESCE(NULLIF(BTRIM(NEW.void_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'A reason is required to void a transfer';
    END IF;
    IF NEW.status = 'VOIDED' AND NEW.voided_at IS NULL THEN
      NEW.voided_at := NOW();
      NEW.voided_by := COALESCE(auth.uid(), OLD.voided_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Guard trigger on organizations (protects currency, symbol, country, timezone)
CREATE OR REPLACE FUNCTION private.guard_organization_regional_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_has_entries BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.currency IS DISTINCT FROM OLD.currency OR
      NEW.currency_symbol IS DISTINCT FROM OLD.currency_symbol OR
      NEW.country IS DISTINCT FROM OLD.country OR
      NEW.timezone IS DISTINCT FROM OLD.timezone) THEN

    SELECT EXISTS (
      SELECT 1 FROM public.shop_members
      WHERE organization_id = NEW.id
        AND user_id = auth.uid()
        AND role = 'OWNER'
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'Only an OWNER can modify organization regional settings';
    END IF;

    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      SELECT (
        EXISTS (SELECT 1 FROM public.transactions WHERE organization_id = NEW.id) OR
        EXISTS (SELECT 1 FROM public.account_ledger_entries WHERE organization_id = NEW.id)
      ) INTO v_has_entries;

      IF v_has_entries THEN
        RAISE EXCEPTION 'currency is locked once entries exist';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_organization_regional_settings ON public.organizations;
CREATE TRIGGER trg_guard_organization_regional_settings
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION private.guard_organization_regional_settings();

-- 6. User Preferences Table with Strict RLS
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_mode TEXT NOT NULL DEFAULT 'chat' CHECK (entry_mode IN ('chat', 'standard', 'both')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ur')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
REVOKE ALL ON public.user_preferences FROM anon;

DROP POLICY IF EXISTS user_preferences_select ON public.user_preferences;
CREATE POLICY user_preferences_select ON public.user_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_insert ON public.user_preferences;
CREATE POLICY user_preferences_insert ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_update ON public.user_preferences;
CREATE POLICY user_preferences_update ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
