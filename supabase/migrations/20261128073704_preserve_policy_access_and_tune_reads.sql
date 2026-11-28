-- Preserve existing access while avoiding repeated per-row identity calls.
-- Restrictive MFA policies remain in place.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER POLICY "account_ledger_entries_select" ON public."account_ledger_entries" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id()))));
ALTER POLICY "Members can view audit log" ON public."audit_log" USING (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "Members can insert categories" ON public."categories" WITH CHECK (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "Members can read categories" ON public."categories" USING (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "Members can update categories" ON public."categories" USING (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "category_aliases_tenant_access" ON public."category_aliases" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())))) WITH CHECK (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id()))));
ALTER POLICY "Members can manage review queue" ON public."review_queue" USING (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "Members can view membership" ON public."shop_members" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id()))));
ALTER POLICY "transaction_drafts_delete" ON public."transaction_drafts" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id()))));
ALTER POLICY "transaction_drafts_insert" ON public."transaction_drafts" WITH CHECK (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())) AND (created_by = (SELECT auth.uid())) AND ((category_id IS NULL) OR (EXISTS ( SELECT 1
   FROM categories
  WHERE ((categories.id = transaction_drafts.category_id) AND (categories.organization_id = transaction_drafts.organization_id)))))));
ALTER POLICY "transaction_drafts_select" ON public."transaction_drafts" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id()))));
ALTER POLICY "transaction_drafts_update" ON public."transaction_drafts" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())) AND (created_by = (SELECT auth.uid())))) WITH CHECK (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())) AND (created_by = (SELECT auth.uid())) AND ((category_id IS NULL) OR (EXISTS ( SELECT 1
   FROM categories
  WHERE ((categories.id = transaction_drafts.category_id) AND (categories.organization_id = transaction_drafts.organization_id)))))));
ALTER POLICY "Members can record transactions" ON public."transactions" WITH CHECK (((SELECT public.is_active_shop_member()) AND (created_by = (SELECT auth.uid())) AND ((organization_id = (SELECT public.get_auth_org_id())) OR (organization_id IS NULL))));
ALTER POLICY "Members can update transactions" ON public."transactions" USING (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())) AND (EXISTS ( SELECT 1
   FROM shop_members member
  WHERE ((member.user_id = (SELECT auth.uid())) AND (member.organization_id = transactions.organization_id) AND (member.role = ANY (ARRAY['OWNER'::text, 'MANAGER'::text]))))))) WITH CHECK (((SELECT public.is_active_shop_member()) AND (organization_id = (SELECT public.get_auth_org_id())) AND (EXISTS ( SELECT 1
   FROM shop_members member
  WHERE ((member.user_id = (SELECT auth.uid())) AND (member.organization_id = transactions.organization_id) AND (member.role = ANY (ARRAY['OWNER'::text, 'MANAGER'::text])))))));
ALTER POLICY "Members can view transactions" ON public."transactions" USING (((SELECT public.is_active_shop_member()) AND ((organization_id = (SELECT public.get_auth_org_id())) OR ((organization_id IS NULL) AND (created_by = (SELECT auth.uid()))))));
ALTER POLICY "user_preferences_insert" ON public."user_preferences" WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "user_preferences_select" ON public."user_preferences" USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "user_preferences_update" ON public."user_preferences" USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));

-- Equivalent OR combination for overlapping authenticated policies.
-- INSERT/UPDATE/DELETE permissions retain every original USING/WITH CHECK expression.
DO $$
DECLARE target TEXT; spec JSONB; item JSONB; action TEXT; clause TEXT; check_clause TEXT;
  command_name TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['account_transfers','categories','customers','expense_categories','payment_accounts','products','service_components','services','stock_movements'] LOOP
    SELECT jsonb_agg(jsonb_build_object('name',pol.polname,'command',pol.polcmd,
      'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)))
    INTO spec FROM pg_policy pol
    WHERE pol.polrelid=format('public.%I',target)::regclass AND pol.polpermissive
      AND pol.polroles=ARRAY['authenticated'::regrole::oid];
    IF spec IS NULL THEN RAISE EXCEPTION 'Expected authenticated policies on %',target; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(spec) LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',item->>'name',target);
    END LOOP;
    FOREACH action IN ARRAY ARRAY['r','a','w','d'] LOOP
      SELECT string_agg('('||COALESCE(value->>'using','true')||')',' OR '),
        string_agg('('||COALESCE(value->>'check',value->>'using','true')||')',' OR ')
      INTO clause,check_clause FROM jsonb_array_elements(spec)
      WHERE value->>'command' IN ('*',action);
      IF clause IS NULL THEN CONTINUE; END IF;
      command_name:=CASE action WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' ELSE 'DELETE' END;
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s %s',
        target||'_access_'||lower(command_name),target,command_name,
        CASE WHEN action='a' THEN '' ELSE 'USING ('||clause||')' END,
        CASE WHEN action IN ('a','w') THEN 'WITH CHECK ('||check_clause||')' ELSE '' END);
    END LOOP;
  END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_account_ledger_account_org_fk ON public.account_ledger_entries(account_id,organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_transaction_fk ON public.audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_category_aliases_category_org_fk ON public.category_aliases(category_id,organization_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_suggested_category_fk ON public.review_queue(suggested_category_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_organization_fk ON public.user_preferences(organization_id);
-- Keep the constraint-backed unique index; remove only its equivalent standalone copy.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='daily_closings_organization_id_closing_date_key')
    AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=to_regclass('public.ux_daily_closings_org_date'))
  THEN DROP INDEX IF EXISTS public.ux_daily_closings_org_date; END IF;
END; $$;
