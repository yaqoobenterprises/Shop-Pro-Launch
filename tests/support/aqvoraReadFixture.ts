import { readFileSync } from "node:fs";

export const readMigrations = [
  "20261120151827_aqvora_read_certification.sql",
  "20261120151923_aqvora_general_ledger_read.sql",
  "20261120151925_aqvora_trial_balance_read.sql",
];
export const readMigrationSql = () => readMigrations.map((file) =>
  readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8")).join("\n");
export const readIds = {
  org: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", otherOrg: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  owner: "11111111-1111-4111-8111-111111111111", manager: "22222222-2222-4222-8222-222222222222",
  cashier: "33333333-3333-4333-8333-333333333333", outsider: "44444444-4444-4444-8444-444444444444",
  cash: "55555555-5555-4555-8555-555555555555", sales: "66666666-6666-4666-8666-666666666666",
  foreign: "77777777-7777-4777-8777-777777777777",
};
export const readFixtureSql = () => {
  const i = readIds;
  const schema = `
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),
        'session_id',current_setting('request.jwt.claim.session_id',true)) $$;
    GRANT USAGE ON SCHEMA auth,private TO authenticated;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,currency text);
    CREATE TABLE public.organization_members(organization_id uuid,user_id uuid,
      role text,is_active boolean,PRIMARY KEY(organization_id,user_id));
    INSERT INTO auth.users VALUES ('${i.owner}'),('${i.manager}'),('${i.cashier}'),('${i.outsider}');
    INSERT INTO auth.sessions SELECT id,id FROM auth.users;
    INSERT INTO public.organizations VALUES ('${i.org}','PKR'),('${i.otherOrg}','PKR');
    INSERT INTO public.organization_members VALUES
      ('${i.org}','${i.owner}','OWNER',true),('${i.org}','${i.manager}','MANAGER',true),
      ('${i.org}','${i.cashier}','CASHIER',true),('${i.otherOrg}','${i.outsider}','OWNER',true);
  `;
  const core = ["20261120010000_aqvora_journal_schema.sql", "20261120010100_aqvora_posting_rpc.sql",
    "20261120010200_aqvora_reversal_rpc.sql", "20261120103750_aqvora_admin_schema.sql",
    "20261120103757_aqvora_admin_account_api.sql", "20261120103805_aqvora_admin_period_api.sql"]
    .map((file) => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8")).join("\n");
  return `${schema}\n${core}\n${readMigrationSql()}\n
    INSERT INTO public.aqvora_enabled_companies VALUES ('${i.org}'),('${i.otherOrg}');
    INSERT INTO public.aqvora_periods(organization_id,starts_on,ends_on,state) VALUES
      ('${i.org}','2026-01-01','2026-12-31','open'),('${i.otherOrg}','2026-01-01','2026-12-31','open');
    INSERT INTO public.aqvora_accounts(organization_id,id,code,name,account_class,normal_side,is_posting) VALUES
      ('${i.org}','${i.cash}','1000','Cash','asset','debit',true),
      ('${i.org}','${i.sales}','4000','Sales','revenue','credit',true),
      ('${i.otherOrg}','${i.foreign}','1000','Other cash','asset','debit',true);
  `;
};
