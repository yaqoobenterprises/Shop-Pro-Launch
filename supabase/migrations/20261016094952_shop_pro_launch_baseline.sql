-- Reconstructed launch baseline from the archived incremental migration history.
-- Existing Supabase migration history already records this version.
-- Verify against an isolated project before using this file to create a new database.

-- Historical source: 20260918000000_initial_schema.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: DATABASE SCHEMA & MULTI-TENANT RLS SPECIFICATION
-- =================================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'PKR',
    currency_symbol VARCHAR(10) DEFAULT 'Rs.',
    country VARCHAR(100) DEFAULT 'Pakistan',
    timezone VARCHAR(100) DEFAULT 'Asia/Karachi',
    business_category VARCHAR(150) DEFAULT 'Printing & Stationery',
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    tax_rate NUMERIC(5,2) DEFAULT 0.00,
    tax_enabled BOOLEAN DEFAULT FALSE,
    receipt_footer TEXT,
    invoice_prefix VARCHAR(20) DEFAULT 'YE-',
    next_invoice_number BIGINT DEFAULT 1001,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER')),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ORGANIZATION MEMBERS (Multi-tenant membership & RBAC)
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'CASHIER' CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 5. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PRODUCT', 'SERVICE', 'BOTH')),
    color VARCHAR(20) DEFAULT '#06B6D4',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCTS / INVENTORY ITEMS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    opening_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    min_stock_threshold NUMERIC(14,2) NOT NULL DEFAULT 5.00,
    track_stock BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    supplier VARCHAR(255),
    notes TEXT,
    average_cost NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    stock_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SERVICES
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    selling_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. SERVICE COMPONENTS / RECIPES (Optional inventory consumption)
CREATE TABLE IF NOT EXISTS public.service_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_consumed NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. STOCK MOVEMENTS (Audit-traceable inventory flow)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (
        movement_type IN (
            'OPENING_STOCK', 'PURCHASE', 'SALE', 'ADJUSTMENT_INCREASE',
            'ADJUSTMENT_DECREASE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN',
            'DAMAGE_WASTAGE', 'CORRECTION'
        )
    ),
    quantity NUMERIC(14,2) NOT NULL,
    unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    total_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    reference_id VARCHAR(100),
    reference_type VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    total_purchases NUMERIC(14,2) DEFAULT 0.00,
    last_purchase_date TIMESTAMPTZ,
    outstanding_balance NUMERIC(14,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PAYMENT ACCOUNTS
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET', 'OTHER')),
    account_number VARCHAR(100),
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. ACCOUNT TRANSFERS
CREATE TABLE IF NOT EXISTS public.account_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    from_account_id UUID NOT NULL REFERENCES public.payment_accounts(id),
    to_account_id UUID NOT NULL REFERENCES public.payment_accounts(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    notes TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. ACCOUNT TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.account_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT')),
    amount NUMERIC(14,2) NOT NULL,
    balance_after NUMERIC(14,2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL CHECK (reference_type IN ('SALE', 'EXPENSE', 'TRANSFER', 'CLOSING')),
    reference_id VARCHAR(100),
    description TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. EXPENSE CATEGORIES
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.expense_categories(id),
    account_id UUID NOT NULL REFERENCES public.payment_accounts(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    reference_number VARCHAR(100),
    date DATE NOT NULL,
    notes TEXT,
    entered_by VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. SALES
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) DEFAULT 'Walk-in Customer',
    customer_phone VARCHAR(50),
    cashier_id VARCHAR(100) NOT NULL,
    cashier_name VARCHAR(255) NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    change_due NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    split_payments JSONB DEFAULT '[]'::jsonb,
    total_cogs NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    gross_profit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    notes TEXT,
    void_reason TEXT,
    voided_by VARCHAR(255),
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. SALE ITEMS
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('PRODUCT', 'SERVICE')),
    item_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unit VARCHAR(50),
    quantity NUMERIC(14,2) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(14,2) NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    cogs NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    gross_profit NUMERIC(14,2) NOT NULL DEFAULT 0.00
);

-- 18. DAILY CLOSINGS
CREATE TABLE IF NOT EXISTS public.daily_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    closing_date DATE NOT NULL,
    opening_cash NUMERIC(14,2) NOT NULL,
    cash_sales NUMERIC(14,2) NOT NULL,
    cash_expenses NUMERIC(14,2) NOT NULL,
    cash_transfers_in NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cash_transfers_out NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    expected_cash NUMERIC(14,2) NOT NULL,
    actual_cash NUMERIC(14,2) NOT NULL,
    difference NUMERIC(14,2) NOT NULL,
    notes TEXT,
    closed_by VARCHAR(255) NOT NULL,
    closed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, closing_date)
);

-- 19. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    details TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================================
-- INDEXES FOR HIGH PERFORMANCE
-- =================================================================================
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_services_org ON public.services(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_prod ON public.stock_movements(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_sales_org_date ON public.sales(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON public.expenses(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_acc_date ON public.account_transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON public.audit_logs(organization_id, created_at);

-- =================================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================================

-- Security helper: check user's associated organization IDs
CREATE OR REPLACE FUNCTION public.get_auth_user_org_ids()
RETURNS TABLE (org_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid() AND is_active = TRUE
    UNION
    SELECT organization_id
    FROM public.profiles
    WHERE id = auth.uid() AND is_active = TRUE;
$$;

-- Enable RLS on all business tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS Policies: Members only access their organization data
CREATE POLICY org_member_select ON public.organizations
    FOR SELECT USING (id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY org_member_update ON public.organizations
    FOR UPDATE USING (id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY products_isolation ON public.products
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY services_isolation ON public.services
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY stock_movements_isolation ON public.stock_movements
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY customers_isolation ON public.customers
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY accounts_isolation ON public.payment_accounts
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY transfers_isolation ON public.account_transfers
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY transactions_isolation ON public.account_transactions
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY expenses_isolation ON public.expenses
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY sales_isolation ON public.sales
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY sale_items_isolation ON public.sale_items
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY daily_closings_isolation ON public.daily_closings
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY audit_logs_isolation ON public.audit_logs
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));


-- Historical source: 20260919000000_harden_rls_and_auth.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: RLS HARDENING, MULTI-TENANT PROVISIONING & SYNC COLUMNS
-- Migration: 20260919000000_harden_rls_and_auth.sql
-- =================================================================================

-- 1. ADD SYNC METADATA COLUMNS TO ALL CLOUD TABLES
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.service_components ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.account_transfers ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.account_transactions ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'synced';

-- 2. COMPLETE MISSING ROW LEVEL SECURITY (RLS) POLICIES

-- Policies for Categories
DROP POLICY IF EXISTS categories_isolation ON public.categories;
CREATE POLICY categories_isolation ON public.categories
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

-- Policies for Expense Categories
DROP POLICY IF EXISTS expense_categories_isolation ON public.expense_categories;
CREATE POLICY expense_categories_isolation ON public.expense_categories
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

-- Policies for Service Components
DROP POLICY IF EXISTS service_components_isolation ON public.service_components;
CREATE POLICY service_components_isolation ON public.service_components
    FOR ALL USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

-- Policies for User Profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
    FOR SELECT USING (
        id = auth.uid() OR
        organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids())
    );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
    FOR UPDATE USING (id = auth.uid());

-- Policies for Organization Members
DROP POLICY IF EXISTS members_select ON public.organization_members;
CREATE POLICY members_select ON public.organization_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids())
    );

DROP POLICY IF EXISTS members_manage ON public.organization_members;
CREATE POLICY members_manage ON public.organization_members
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid() AND role = 'OWNER'
        )
    );

-- 3. AUTOMATED SECURE TENANT & PROFILE INITIALIZATION TRIGGER
-- When a user signs up via Supabase Auth, securely create their organization and initial Owner profile.
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
    org_name_val TEXT;
    full_name_val TEXT;
BEGIN
    org_name_val := COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Yaqoob Enterprises');
    full_name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

    -- 1. Create Organization
    INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
    VALUES (org_name_val, full_name_val, 'PKR', 'Rs.')
    RETURNING id INTO new_org_id;

    -- 2. Create User Profile
    INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
    VALUES (NEW.id, NEW.email, full_name_val, 'OWNER', new_org_id, TRUE);

    -- 3. Create Organization Membership
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (new_org_id, NEW.id, 'OWNER', TRUE);

    -- 4. Seed Standard Default Payment Accounts
    INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default)
    VALUES
        (new_org_id, 'Cash Drawer (Shop Till)', 'CASH', 10000.00, 10000.00, TRUE),
        (new_org_id, 'Business Bank Account (HBL/Meezan)', 'BANK', 50000.00, 50000.00, FALSE),
        (new_org_id, 'JazzCash Merchant Wallet', 'DIGITAL_WALLET', 5000.00, 5000.00, FALSE),
        (new_org_id, 'Easypaisa Business Wallet', 'DIGITAL_WALLET', 5000.00, 5000.00, FALSE);

    -- 5. Seed Standard Categories
    INSERT INTO public.categories (organization_id, name, type, color)
    VALUES
        (new_org_id, 'Printing & Photocopying', 'SERVICE', '#06B6D4'),
        (new_org_id, 'Documentation & Legal Drafting', 'SERVICE', '#3B82F6'),
        (new_org_id, 'Paper & Consumables', 'PRODUCT', '#10B981'),
        (new_org_id, 'Office Stationery', 'PRODUCT', '#F59E0B');

    -- 6. Seed Standard Expense Categories
    INSERT INTO public.expense_categories (organization_id, name, description)
    VALUES
        (new_org_id, 'Paper & Ink Purchases', 'Direct raw material and consumables'),
        (new_org_id, 'Shop Electricity & Utilities', 'Commercial electricity and power backup'),
        (new_org_id, 'Shop Rent & Maintenance', 'Monthly shop rental and repairs'),
        (new_org_id, 'Tea, Refreshments & General', 'Daily staff tea and cleaning supplies');

    RETURN NEW;
END;
$$;

-- Register trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_registration();


-- Historical source: 20260920000000_lock_down_rls_policies.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: RLS LOCKDOWN & POLICY CHECK HARDENING
-- Migration: 20260920000000_lock_down_rls_policies.sql
-- =================================================================================

-- Keep helper functions callable only by signed-in users. RLS policies call this
-- helper for tenant membership checks, so anon should never execute it directly.
CREATE OR REPLACE FUNCTION public.get_auth_user_org_ids()
RETURNS TABLE (org_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = (SELECT auth.uid()) AND is_active = TRUE
    UNION
    SELECT organization_id
    FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_org_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_ids() TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user_registration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_registration() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user_registration() FROM authenticated;

-- Data API access is granted to authenticated sessions only; RLS below decides rows.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Ensure all tenant tables remain protected.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_member_select ON public.organizations;
DROP POLICY IF EXISTS org_member_update ON public.organizations;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS members_select ON public.organization_members;
DROP POLICY IF EXISTS members_manage ON public.organization_members;

DROP POLICY IF EXISTS categories_isolation ON public.categories;
DROP POLICY IF EXISTS products_isolation ON public.products;
DROP POLICY IF EXISTS services_isolation ON public.services;
DROP POLICY IF EXISTS service_components_isolation ON public.service_components;
DROP POLICY IF EXISTS stock_movements_isolation ON public.stock_movements;
DROP POLICY IF EXISTS customers_isolation ON public.customers;
DROP POLICY IF EXISTS accounts_isolation ON public.payment_accounts;
DROP POLICY IF EXISTS transfers_isolation ON public.account_transfers;
DROP POLICY IF EXISTS transactions_isolation ON public.account_transactions;
DROP POLICY IF EXISTS expense_categories_isolation ON public.expense_categories;
DROP POLICY IF EXISTS expenses_isolation ON public.expenses;
DROP POLICY IF EXISTS sales_isolation ON public.sales;
DROP POLICY IF EXISTS sale_items_isolation ON public.sale_items;
DROP POLICY IF EXISTS daily_closings_isolation ON public.daily_closings;
DROP POLICY IF EXISTS audit_logs_isolation ON public.audit_logs;

-- This migration is safe to rerun if a prior deployment applied statements
-- before failing. Remove the policy names created below before recreating them.
DROP POLICY IF EXISTS organizations_select ON public.organizations;
DROP POLICY IF EXISTS organizations_update ON public.organizations;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_manage ON public.organization_members;
DROP POLICY IF EXISTS categories_tenant_access ON public.categories;
DROP POLICY IF EXISTS products_tenant_access ON public.products;
DROP POLICY IF EXISTS services_tenant_access ON public.services;
DROP POLICY IF EXISTS service_components_tenant_access ON public.service_components;
DROP POLICY IF EXISTS stock_movements_tenant_access ON public.stock_movements;
DROP POLICY IF EXISTS customers_tenant_access ON public.customers;
DROP POLICY IF EXISTS payment_accounts_tenant_access ON public.payment_accounts;
DROP POLICY IF EXISTS account_transfers_tenant_access ON public.account_transfers;
DROP POLICY IF EXISTS account_transactions_tenant_access ON public.account_transactions;
DROP POLICY IF EXISTS expense_categories_tenant_access ON public.expense_categories;
DROP POLICY IF EXISTS expenses_tenant_access ON public.expenses;
DROP POLICY IF EXISTS sales_tenant_access ON public.sales;
DROP POLICY IF EXISTS sale_items_tenant_access ON public.sale_items;
DROP POLICY IF EXISTS daily_closings_tenant_access ON public.daily_closings;
DROP POLICY IF EXISTS audit_logs_tenant_access ON public.audit_logs;

CREATE POLICY organizations_select ON public.organizations
    FOR SELECT TO authenticated
    USING (id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY organizations_update ON public.organizations
    FOR UPDATE TO authenticated
    USING (id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY profiles_select ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = (SELECT auth.uid()) OR
        organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids())
    );

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (
        id = (SELECT auth.uid()) AND
        organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids())
    );

CREATE POLICY organization_members_select ON public.organization_members
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid()) OR
        organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids())
    );

CREATE POLICY organization_members_owner_manage ON public.organization_members
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY categories_tenant_access ON public.categories
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY products_tenant_access ON public.products
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY services_tenant_access ON public.services
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY service_components_tenant_access ON public.service_components
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY stock_movements_tenant_access ON public.stock_movements
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY customers_tenant_access ON public.customers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY payment_accounts_tenant_access ON public.payment_accounts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY account_transfers_tenant_access ON public.account_transfers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY account_transactions_tenant_access ON public.account_transactions
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY expense_categories_tenant_access ON public.expense_categories
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY expenses_tenant_access ON public.expenses
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY sales_tenant_access ON public.sales
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY sale_items_tenant_access ON public.sale_items
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY daily_closings_tenant_access ON public.daily_closings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));

CREATE POLICY audit_logs_tenant_access ON public.audit_logs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM public.get_auth_user_org_ids()));


-- Historical source: 20260920001000_add_fk_indexes_and_split_member_policies.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: FK INDEXES & ORGANIZATION MEMBER POLICY SPLIT
-- Migration: 20260920001000_add_fk_indexes_and_split_member_policies.sql
-- =================================================================================

CREATE INDEX IF NOT EXISTS idx_account_transactions_org ON public.account_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_from_account ON public.account_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_org ON public.account_transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to_account ON public.account_transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_org ON public.expense_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON public.expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_org ON public.payment_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_org ON public.sale_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_components_org ON public.service_components(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_components_product ON public.service_components(product_id);
CREATE INDEX IF NOT EXISTS idx_service_components_service ON public.service_components(service_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);

DROP POLICY IF EXISTS organization_members_owner_manage ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_insert ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_update ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_delete ON public.organization_members;

CREATE POLICY organization_members_owner_insert ON public.organization_members
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY organization_members_owner_update ON public.organization_members
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY organization_members_owner_delete ON public.organization_members
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );


-- Historical source: 20260920002000_move_rls_helper_to_private_schema.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: MOVE RLS HELPER OUT OF EXPOSED PUBLIC SCHEMA
-- Migration: 20260920002000_move_rls_helper_to_private_schema.sql
-- =================================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.get_auth_user_org_ids()
RETURNS TABLE (org_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = (SELECT auth.uid()) AND is_active = TRUE
    UNION
    SELECT organization_id
    FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION private.get_auth_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_auth_user_org_ids() TO authenticated;

DROP POLICY IF EXISTS organizations_select ON public.organizations;
DROP POLICY IF EXISTS organizations_update ON public.organizations;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_insert ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_update ON public.organization_members;
DROP POLICY IF EXISTS organization_members_owner_delete ON public.organization_members;
DROP POLICY IF EXISTS categories_tenant_access ON public.categories;
DROP POLICY IF EXISTS products_tenant_access ON public.products;
DROP POLICY IF EXISTS services_tenant_access ON public.services;
DROP POLICY IF EXISTS service_components_tenant_access ON public.service_components;
DROP POLICY IF EXISTS stock_movements_tenant_access ON public.stock_movements;
DROP POLICY IF EXISTS customers_tenant_access ON public.customers;
DROP POLICY IF EXISTS payment_accounts_tenant_access ON public.payment_accounts;
DROP POLICY IF EXISTS account_transfers_tenant_access ON public.account_transfers;
DROP POLICY IF EXISTS account_transactions_tenant_access ON public.account_transactions;
DROP POLICY IF EXISTS expense_categories_tenant_access ON public.expense_categories;
DROP POLICY IF EXISTS expenses_tenant_access ON public.expenses;
DROP POLICY IF EXISTS sales_tenant_access ON public.sales;
DROP POLICY IF EXISTS sale_items_tenant_access ON public.sale_items;
DROP POLICY IF EXISTS daily_closings_tenant_access ON public.daily_closings;
DROP POLICY IF EXISTS audit_logs_tenant_access ON public.audit_logs;

CREATE POLICY organizations_select ON public.organizations
    FOR SELECT TO authenticated
    USING (id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY organizations_update ON public.organizations
    FOR UPDATE TO authenticated
    USING (id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY profiles_select ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = (SELECT auth.uid()) OR
        organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids())
    );

CREATE POLICY profiles_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (
        id = (SELECT auth.uid()) AND
        organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids())
    );

CREATE POLICY organization_members_select ON public.organization_members
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid()) OR
        organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids())
    );

CREATE POLICY organization_members_owner_insert ON public.organization_members
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY organization_members_owner_update ON public.organization_members
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY organization_members_owner_delete ON public.organization_members
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid()) AND role = 'OWNER' AND is_active = TRUE
        )
    );

CREATE POLICY categories_tenant_access ON public.categories
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY products_tenant_access ON public.products
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY services_tenant_access ON public.services
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY service_components_tenant_access ON public.service_components
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY stock_movements_tenant_access ON public.stock_movements
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY customers_tenant_access ON public.customers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY payment_accounts_tenant_access ON public.payment_accounts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY account_transfers_tenant_access ON public.account_transfers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY account_transactions_tenant_access ON public.account_transactions
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY expense_categories_tenant_access ON public.expense_categories
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY expenses_tenant_access ON public.expenses
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY sales_tenant_access ON public.sales
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY sale_items_tenant_access ON public.sale_items
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY daily_closings_tenant_access ON public.daily_closings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

CREATE POLICY audit_logs_tenant_access ON public.audit_logs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT org_id FROM private.get_auth_user_org_ids()));

DROP FUNCTION IF EXISTS public.get_auth_user_org_ids();


-- Historical source: 20260920003000_repair_signup_profile_provisioning.sql
-- Repair signup provisioning for projects where the original auth trigger was not applied.
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_name_val TEXT;
  full_name_val TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  org_name_val := COALESCE(NULLIF(NEW.raw_user_meta_data->>'organization_name', ''), 'Yaqoob Enterprises');
  full_name_val := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (org_name_val, full_name_val, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
  VALUES (NEW.id, NEW.email, full_name_val, 'OWNER', new_org_id, TRUE);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, NEW.id, 'OWNER', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default)
  VALUES
    (new_org_id, 'Cash Drawer (Shop Till)', 'CASH', 10000.00, 10000.00, TRUE),
    (new_org_id, 'Business Bank Account', 'BANK', 0.00, 0.00, FALSE),
    (new_org_id, 'JazzCash Merchant Wallet', 'DIGITAL_WALLET', 0.00, 0.00, FALSE),
    (new_org_id, 'Easypaisa Business Wallet', 'DIGITAL_WALLET', 0.00, 0.00, FALSE);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_registration();

-- This operation is callable only by the currently authenticated user and never
-- accepts a user ID, organization ID, role, or ownership value from the client.
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  auth_email TEXT;
  metadata JSONB;
  new_org_id UUID;
  full_name_val TEXT;
  org_name_val TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email, raw_user_meta_data
  INTO auth_email, metadata
  FROM auth.users
  WHERE id = current_user_id;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RETURN;
  END IF;

  full_name_val := COALESCE(NULLIF(metadata->>'full_name', ''), auth_email);
  org_name_val := COALESCE(NULLIF(metadata->>'organization_name', ''), 'Yaqoob Enterprises');

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (org_name_val, full_name_val, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
  VALUES (current_user_id, auth_email, full_name_val, 'OWNER', new_org_id, TRUE);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, current_user_id, 'OWNER', TRUE);

  INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default)
  VALUES (new_org_id, 'Cash Drawer (Shop Till)', 'CASH', 10000.00, 10000.00, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;


-- Historical source: 20260921000000_role_authorization_and_integrity.sql
-- Role-aware authorization and tenant-safe integrity policies.
CREATE OR REPLACE FUNCTION private.is_org_member(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_org
      AND user_id = (SELECT auth.uid())
      AND is_active = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE organization_id = target_org
      AND id = (SELECT auth.uid())
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.get_org_role(target_org UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = target_org AND user_id = (SELECT auth.uid()) AND is_active = TRUE
  UNION ALL
  SELECT role FROM public.profiles
  WHERE organization_id = target_org AND id = (SELECT auth.uid()) AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_org_owner(target_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT private.get_org_role(target_org) = 'OWNER';
$$;

CREATE OR REPLACE FUNCTION private.is_org_manager(target_org UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT private.get_org_role(target_org) IN ('OWNER', 'MANAGER');
$$;

CREATE OR REPLACE FUNCTION private.has_permission(target_org UUID, permission_name TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE private.get_org_role(target_org)
    WHEN 'OWNER' THEN TRUE
    WHEN 'MANAGER' THEN permission_name IN (
      'FAST_POS_CHECKOUT', 'RECORD_EXPENSES', 'SUBMIT_DAILY_CLOSING',
      'VOID_SALE', 'VOID_EXPENSE', 'MANAGE_INVENTORY', 'ACCOUNT_TRANSFER', 'VIEW_REPORTS_PL'
    )
    WHEN 'CASHIER' THEN permission_name IN (
      'FAST_POS_CHECKOUT', 'RECORD_EXPENSES', 'SUBMIT_DAILY_CLOSING'
    )
    ELSE FALSE
  END;
$$;

REVOKE ALL ON FUNCTION private.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_org_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_org_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_org_manager(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_org_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_manager(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_permission(UUID, TEXT) TO authenticated;

-- Profiles cannot be used to self-promote or change organization ownership.
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    AND role = (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

-- Remove tenant-only FOR ALL policies before adding role-aware policies.
DROP POLICY IF EXISTS categories_tenant_access ON public.categories;
DROP POLICY IF EXISTS products_tenant_access ON public.products;
DROP POLICY IF EXISTS services_tenant_access ON public.services;
DROP POLICY IF EXISTS service_components_tenant_access ON public.service_components;
DROP POLICY IF EXISTS stock_movements_tenant_access ON public.stock_movements;
DROP POLICY IF EXISTS customers_tenant_access ON public.customers;
DROP POLICY IF EXISTS payment_accounts_tenant_access ON public.payment_accounts;
DROP POLICY IF EXISTS account_transfers_tenant_access ON public.account_transfers;
DROP POLICY IF EXISTS account_transactions_tenant_access ON public.account_transactions;
DROP POLICY IF EXISTS expense_categories_tenant_access ON public.expense_categories;
DROP POLICY IF EXISTS expenses_tenant_access ON public.expenses;
DROP POLICY IF EXISTS sales_tenant_access ON public.sales;
DROP POLICY IF EXISTS sale_items_tenant_access ON public.sale_items;
DROP POLICY IF EXISTS daily_closings_tenant_access ON public.daily_closings;
DROP POLICY IF EXISTS audit_logs_tenant_access ON public.audit_logs;

CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated USING (private.has_permission(organization_id, 'MANAGE_INVENTORY')) WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY products_write ON public.products FOR ALL TO authenticated USING (private.has_permission(organization_id, 'MANAGE_INVENTORY')) WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY services_write ON public.services FOR ALL TO authenticated USING (private.has_permission(organization_id, 'MANAGE_INVENTORY')) WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));
CREATE POLICY service_components_select ON public.service_components FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY service_components_write ON public.service_components FOR ALL TO authenticated USING (private.has_permission(organization_id, 'MANAGE_INVENTORY')) WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY stock_movements_write ON public.stock_movements FOR ALL TO authenticated USING (private.has_permission(organization_id, 'MANAGE_INVENTORY')) WITH CHECK (private.has_permission(organization_id, 'MANAGE_INVENTORY'));
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id));
CREATE POLICY accounts_select ON public.payment_accounts FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY accounts_write ON public.payment_accounts FOR ALL TO authenticated USING (private.is_org_owner(organization_id)) WITH CHECK (private.is_org_owner(organization_id));
CREATE POLICY transfers_select ON public.account_transfers FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY transfers_write ON public.account_transfers FOR ALL TO authenticated USING (private.has_permission(organization_id, 'ACCOUNT_TRANSFER')) WITH CHECK (private.has_permission(organization_id, 'ACCOUNT_TRANSFER'));
CREATE POLICY transactions_select ON public.account_transactions FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY transactions_write ON public.account_transactions FOR INSERT TO authenticated WITH CHECK (private.has_permission(organization_id, 'ACCOUNT_TRANSFER') OR private.has_permission(organization_id, 'FAST_POS_CHECKOUT') OR private.has_permission(organization_id, 'RECORD_EXPENSES'));
CREATE POLICY expense_categories_select ON public.expense_categories FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY expense_categories_write ON public.expense_categories FOR ALL TO authenticated USING (private.is_org_owner(organization_id)) WITH CHECK (private.is_org_owner(organization_id));
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (private.has_permission(organization_id, 'RECORD_EXPENSES'));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (private.has_permission(organization_id, 'VOID_EXPENSE')) WITH CHECK (private.has_permission(organization_id, 'VOID_EXPENSE'));
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (private.has_permission(organization_id, 'FAST_POS_CHECKOUT'));
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (private.has_permission(organization_id, 'VOID_SALE')) WITH CHECK (private.has_permission(organization_id, 'VOID_SALE'));
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY sale_items_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK (private.has_permission(organization_id, 'FAST_POS_CHECKOUT'));
CREATE POLICY closings_select ON public.daily_closings FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY closings_insert ON public.daily_closings FOR INSERT TO authenticated WITH CHECK (private.has_permission(organization_id, 'SUBMIT_DAILY_CLOSING'));
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id));

-- Cross-tenant references are rejected by validation triggers, not only by foreign keys.
CREATE OR REPLACE FUNCTION private.enforce_same_organization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'expenses' AND NOT EXISTS (
    SELECT 1 FROM public.payment_accounts a WHERE a.id = NEW.account_id AND a.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'Expense account belongs to another organization'; END IF;
  IF TG_TABLE_NAME = 'sales' AND NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'Sale customer belongs to another organization'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_same_org ON public.expenses;
CREATE TRIGGER expenses_same_org BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.enforce_same_organization();
DROP TRIGGER IF EXISTS sales_same_org ON public.sales;
CREATE TRIGGER sales_same_org BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.enforce_same_organization();


-- Historical source: 20260921001000_local_integrity_indexes.sql
-- Local SQLite mirrors these uniqueness guarantees in its migration layer.
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_closings_org_date
  ON public.daily_closings(organization_id, closing_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_org_invoice
  ON public.sales(organization_id, invoice_number);


-- Historical source: 20260921002000_add_avatar_url_and_profile_sync.sql
-- =================================================================================
-- YAQOOB ENTERPRISES MANAGER: PROFILE AVATAR & GOOGLE PROFILE METADATA SYNC
-- Migration: 20260921002000_add_avatar_url_and_profile_sync.sql
-- =================================================================================

-- 1. Add avatar_url column to public.profiles if not present
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Update registration trigger to extract avatar_url from Google / OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_name_val TEXT;
  full_name_val TEXT;
  avatar_url_val TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  org_name_val := COALESCE(NULLIF(NEW.raw_user_meta_data->>'organization_name', ''), 'Yaqoob Enterprises');
  full_name_val := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );
  avatar_url_val := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(NEW.raw_user_meta_data->>'picture', '')
  );

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (org_name_val, full_name_val, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active, avatar_url)
  VALUES (NEW.id, NEW.email, full_name_val, 'OWNER', new_org_id, TRUE, avatar_url_val);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, NEW.id, 'OWNER', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default)
  VALUES
    (new_org_id, 'Cash Drawer (Shop Till)', 'CASH', 10000.00, 10000.00, TRUE),
    (new_org_id, 'Business Bank Account', 'BANK', 0.00, 0.00, FALSE),
    (new_org_id, 'JazzCash Merchant Wallet', 'DIGITAL_WALLET', 0.00, 0.00, FALSE),
    (new_org_id, 'Easypaisa Business Wallet', 'DIGITAL_WALLET', 0.00, 0.00, FALSE);

  RETURN NEW;
END;
$$;

-- 3. Update ensure_my_profile() to also extract avatar_url
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  auth_email TEXT;
  metadata JSONB;
  new_org_id UUID;
  full_name_val TEXT;
  org_name_val TEXT;
  avatar_url_val TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email, raw_user_meta_data
  INTO auth_email, metadata
  FROM auth.users
  WHERE id = current_user_id;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RETURN;
  END IF;

  full_name_val := COALESCE(
    NULLIF(metadata->>'full_name', ''),
    NULLIF(metadata->>'name', ''),
    auth_email
  );
  org_name_val := COALESCE(NULLIF(metadata->>'organization_name', ''), 'Yaqoob Enterprises');
  avatar_url_val := COALESCE(
    NULLIF(metadata->>'avatar_url', ''),
    NULLIF(metadata->>'picture', '')
  );

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (org_name_val, full_name_val, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active, avatar_url)
  VALUES (current_user_id, auth_email, full_name_val, 'OWNER', new_org_id, TRUE, avatar_url_val);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, current_user_id, 'OWNER', TRUE);

  INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default)
  VALUES (new_org_id, 'Cash Drawer (Shop Till)', 'CASH', 10000.00, 10000.00, TRUE);
END;
$$;


-- Historical source: 20261004000000_shop_ledger_foundation.sql
-- ============================================================================
-- YAQUB ENTERPRISES MANAGER — MODERN MULTI-SHOP LEDGER FOUNDATION
-- Migration: 20261004000000_shop_ledger_foundation.sql
-- ============================================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM (
    'income',
    'expense',
    'capital_in',
    'withdrawal',
    'adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_status AS ENUM (
    'active',
    'voided'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.category_kind AS ENUM (
    'income',
    'expense'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.adjustment_direction AS ENUM (
    'in',
    'out'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. ORGANIZATIONS / SHOPS (Multi-Shop SaaS Foundation)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_name TEXT,
  currency TEXT NOT NULL DEFAULT 'PKR',
  currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
  country TEXT DEFAULT 'Pakistan',
  timezone TEXT DEFAULT 'Asia/Karachi',
  business_category TEXT DEFAULT 'Physical Services & Documentation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.organizations (id, name, owner_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Yaqoob Enterprises', 'Jamal Yaqoob')
ON CONFLICT (id) DO NOTHING;

-- 3. SHOP MEMBERS (Team & Multi-User Collaboration within each Shop)
CREATE TABLE IF NOT EXISTS public.shop_members (
  user_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.shop_members ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.shop_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'OWNER';
CREATE INDEX IF NOT EXISTS idx_shop_members_org_user ON public.shop_members(organization_id, user_id);

-- 4. CATEGORIES (Per-Shop / Multi-Tenant Support)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  kind public.category_kind NOT NULL DEFAULT 'income',
  unusual_amount_limit_paisa BIGINT NOT NULL DEFAULT 5000000, -- Default Rs 50,000 in paisa
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS kind public.category_kind DEFAULT 'income';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS unusual_amount_limit_paisa BIGINT DEFAULT 5000000;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.categories ALTER COLUMN type DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN null;
  WHEN others THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.categories ADD CONSTRAINT ux_categories_name_org UNIQUE (organization_id, name);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

-- 5. CATEGORY ALIASES (exact/phonetic synonyms; no numeric aliases allowed)
CREATE TABLE IF NOT EXISTS public.category_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  match_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_category_alias UNIQUE (alias),
  CONSTRAINT chk_no_numeric_alias CHECK (alias !~ '^[0-9]+$')
);

-- 6. TRANSACTIONS (Core Ledger with Multi-Tenant & Multi-User Attribution)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  type public.transaction_type NOT NULL,
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa > 0),
  category_id UUID REFERENCES public.categories(id),
  adjustment_dir public.adjustment_direction, -- Required only if type = 'adjustment'
  business_date DATE NOT NULL,                -- Derived in Asia/Karachi from device entry time
  device_entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  raw_text TEXT NOT NULL,
  status public.transaction_status NOT NULL DEFAULT 'active',
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_transactions_idempotency UNIQUE (idempotency_key),
  CONSTRAINT chk_adjustment_requires_note CHECK (
    type != 'adjustment' OR (note IS NOT NULL AND length(trim(note)) > 0 AND adjustment_dir IS NOT NULL)
  ),
  CONSTRAINT chk_void_requires_reason CHECK (
    status != 'voided' OR (void_reason IS NOT NULL AND length(trim(void_reason)) > 0 AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON public.transactions(organization_id, business_date);
CREATE INDEX IF NOT EXISTS idx_transactions_business_date ON public.transactions(business_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status_type ON public.transactions(status, type);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON public.transactions(category_id);

-- 7. AUDIT LOG (Immutable History of Edits and Voids - System Triggered Only)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'void', 'restore')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID NOT NULL,
  changed_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- 8. REVIEW QUEUE
CREATE TABLE IF NOT EXISTS public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  raw_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  suggested_category_id UUID REFERENCES public.categories(id),
  suggested_amount_paisa BIGINT,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.review_queue ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- ============================================================================
-- HELPER FUNCTIONS FOR MULTI-SHOP ATTRIBUTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.shop_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.is_active_shop_member()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shop_members WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

-- ============================================================================
-- DATABASE TRIGGERS & CONSTRAINTS
-- ============================================================================

-- A. CATEGORY KIND & TRANSACTION TYPE ENFORCEMENT TRIGGER
CREATE OR REPLACE FUNCTION public.check_transaction_category_match()
RETURNS TRIGGER AS $$
DECLARE
  cat_kind public.category_kind;
BEGIN
  IF NEW.type IN ('capital_in', 'withdrawal') THEN
    NEW.category_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.type = 'adjustment' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT kind INTO cat_kind FROM public.categories WHERE id = NEW.category_id;
    IF cat_kind IS NOT NULL THEN
      IF NEW.type = 'income' AND cat_kind != 'income' THEN
        RAISE EXCEPTION 'Transaction type (%) does not match category kind (%)', NEW.type, cat_kind;
      ELSIF NEW.type = 'expense' AND cat_kind != 'expense' THEN
        RAISE EXCEPTION 'Transaction type (%) does not match category kind (%)', NEW.type, cat_kind;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_check_transaction_category ON public.transactions;
CREATE TRIGGER trg_check_transaction_category
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.check_transaction_category_match();

-- B. KARACHI BUSINESS DATE ENFORCEMENT TRIGGER
CREATE OR REPLACE FUNCTION public.set_karachi_business_date()
RETURNS TRIGGER AS $$
DECLARE
  today_karachi DATE := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
BEGIN
  IF NEW.business_date IS NULL THEN
    NEW.business_date := today_karachi;
  ELSIF NEW.business_date > today_karachi THEN
    RAISE EXCEPTION 'Future business dates are prohibited (% > %)', NEW.business_date, today_karachi;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_business_date ON public.transactions;
CREATE TRIGGER trg_set_business_date
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.set_karachi_business_date();

-- C. AUTO-POPULATE CREATED_BY, CREATED_BY_NAME & ORGANIZATION_ID ON INSERT
CREATE OR REPLACE FUNCTION public.enforce_transaction_insert_defaults()
RETURNS TRIGGER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_member_name TEXT;
  v_org_id UUID;
BEGIN
  IF v_uid IS NOT NULL THEN
    NEW.created_by := v_uid;
    SELECT organization_id, full_name INTO v_org_id, v_member_name
    FROM public.shop_members
    WHERE user_id = v_uid
    LIMIT 1;

    IF v_org_id IS NOT NULL AND (NEW.organization_id IS NULL OR NEW.organization_id = '00000000-0000-0000-0000-000000000001'::UUID) THEN
      NEW.organization_id := v_org_id;
    END IF;

    IF v_member_name IS NOT NULL THEN
      NEW.created_by_name := v_member_name;
    END IF;
  END IF;

  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'Authentication required: created_by cannot be null.';
  END IF;

  NEW.created_at := NOW();
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_enforce_transaction_insert ON public.transactions;
CREATE TRIGGER trg_enforce_transaction_insert
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_insert_defaults();

-- D. AUDIT TRAIL & OPTIMISTIC CONCURRENCY TRIGGER ON UPDATE
CREATE OR REPLACE FUNCTION public.audit_transactions_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_action TEXT;
BEGIN
  IF OLD.updated_at != NEW.updated_at THEN
    RAISE EXCEPTION 'Stale update: transaction has been modified concurrently.';
  END IF;

  IF OLD.status = 'active' AND NEW.status = 'voided' THEN
    v_action := 'void';
  ELSIF OLD.status = 'voided' AND NEW.status = 'active' THEN
    v_action := 'restore';
  ELSE
    v_action := 'edit';
  END IF;

  NEW.updated_at := NOW();

  IF v_user_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name FROM public.shop_members WHERE user_id = v_user_id;
  END IF;
  IF v_user_name IS NULL THEN v_user_name := COALESCE(NEW.created_by_name, 'Shop User'); END IF;

  INSERT INTO public.audit_log (transaction_id, organization_id, action, old_data, new_data, changed_by, changed_by_name)
  VALUES (NEW.id, NEW.organization_id, v_action, to_jsonb(OLD), to_jsonb(NEW), COALESCE(v_user_id, NEW.created_by), v_user_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
CREATE TRIGGER trg_audit_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_mutation();

-- E. HARD DELETE PREVENTION TRIGGER
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_transactions()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion is prohibited on transactions. Set status to voided instead.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_block_delete_transactions ON public.transactions;
CREATE TRIGGER trg_block_delete_transactions
BEFORE DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_transactions();

-- F. TRUNCATE PREVENTION TRIGGER ACROSS ALL LEDGER TABLES
CREATE OR REPLACE FUNCTION public.prevent_truncate_ledger()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is prohibited on ledger tables.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_block_truncate_transactions ON public.transactions;
CREATE TRIGGER trg_block_truncate_transactions
BEFORE TRUNCATE ON public.transactions
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate_ledger();

DROP TRIGGER IF EXISTS trg_block_truncate_categories ON public.categories;
CREATE TRIGGER trg_block_truncate_categories
BEFORE TRUNCATE ON public.categories
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate_ledger();

DROP TRIGGER IF EXISTS trg_block_truncate_audit ON public.audit_log;
CREATE TRIGGER trg_block_truncate_audit
BEFORE TRUNCATE ON public.audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate_ledger();

-- ============================================================================
-- SHARED REPORTING SQL VIEWS (WITH security_invoker = true)
-- ============================================================================

-- 1. DAILY SUMMARY VIEW
CREATE OR REPLACE VIEW public.view_daily_summary WITH (security_invoker = true) AS
SELECT
  business_date,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'income' AND status = 'active'), 0)::BIGINT AS income_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'expense' AND status = 'active'), 0)::BIGINT AS expense_paisa,
  (
    COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'income' AND status = 'active'), 0) -
    COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'expense' AND status = 'active'), 0)
  )::BIGINT AS net_profit_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'capital_in' AND status = 'active'), 0)::BIGINT AS capital_in_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'withdrawal' AND status = 'active'), 0)::BIGINT AS withdrawal_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'adjustment' AND status = 'active' AND adjustment_dir = 'in'), 0)::BIGINT AS adjustment_in_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'adjustment' AND status = 'active' AND adjustment_dir = 'out'), 0)::BIGINT AS adjustment_out_paisa,
  COUNT(*) FILTER (WHERE status = 'active')::INT AS transaction_count
FROM public.transactions
GROUP BY business_date
ORDER BY business_date DESC;

-- 2. MONTHLY SUMMARY VIEW
CREATE OR REPLACE VIEW public.view_monthly_summary WITH (security_invoker = true) AS
SELECT
  DATE_TRUNC('month', business_date)::DATE AS month_start,
  EXTRACT(YEAR FROM business_date)::INT AS year,
  EXTRACT(MONTH FROM business_date)::INT AS month,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'income' AND status = 'active'), 0)::BIGINT AS income_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'expense' AND status = 'active'), 0)::BIGINT AS expense_paisa,
  (
    COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'income' AND status = 'active'), 0) -
    COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'expense' AND status = 'active'), 0)
  )::BIGINT AS net_profit_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'capital_in' AND status = 'active'), 0)::BIGINT AS capital_in_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'withdrawal' AND status = 'active'), 0)::BIGINT AS withdrawal_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'adjustment' AND status = 'active' AND adjustment_dir = 'in'), 0)::BIGINT AS adjustment_in_paisa,
  COALESCE(SUM(amount_paisa) FILTER (WHERE type = 'adjustment' AND status = 'active' AND adjustment_dir = 'out'), 0)::BIGINT AS adjustment_out_paisa
FROM public.transactions
GROUP BY DATE_TRUNC('month', business_date), EXTRACT(YEAR FROM business_date), EXTRACT(MONTH FROM business_date)
ORDER BY month_start DESC;

-- 3. CATEGORY BREAKDOWN VIEW
CREATE OR REPLACE VIEW public.view_category_breakdown WITH (security_invoker = true) AS
SELECT
  t.business_date,
  t.type,
  c.id AS category_id,
  COALESCE(c.name, 'Uncategorized') AS category_name,
  SUM(t.amount_paisa)::BIGINT AS total_paisa,
  COUNT(t.id)::INT AS entry_count
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
WHERE t.status = 'active' AND t.type IN ('income', 'expense')
GROUP BY t.business_date, t.type, c.id, c.name;

-- ============================================================================
-- PERMISSIONS, ROLE SECURITY & RLS POLICIES (MEMBER-ONLY & TENANT ISOLATION)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Explicitly revoke all privileges from anon role on tables, views, sequences, functions
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Revoke DELETE and TRUNCATE from authenticated role
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated, anon, public;

-- Revoke direct INSERT, UPDATE, DELETE on audit_log from authenticated (audit trigger writes it)
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon, public;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.category_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue FORCE ROW LEVEL SECURITY;

-- Anti-Spoofing Trigger: Guarantees created_by strictly equals auth.uid()
CREATE OR REPLACE FUNCTION public.enforce_transaction_author()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.created_by != auth.uid() THEN
    RAISE EXCEPTION 'Transaction created_by (%) cannot be spoofed; must match auth.uid() (%)', NEW.created_by, auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_transaction_author ON public.transactions;
CREATE TRIGGER trg_enforce_transaction_author
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_author();

-- Organizations Policy: Only shop members can see their own organization
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;
CREATE POLICY "Members can view their organization" ON public.organizations FOR SELECT TO authenticated
USING (id IN (SELECT organization_id FROM public.shop_members WHERE user_id = auth.uid()));

-- Shop Members Policy
DROP POLICY IF EXISTS "Members can view membership" ON public.shop_members;
CREATE POLICY "Members can view membership" ON public.shop_members FOR SELECT TO authenticated
USING (public.is_active_shop_member() AND organization_id = public.get_auth_org_id());

-- Categories Policies (Tenant-Scoped)
DROP POLICY IF EXISTS "Members can read categories" ON public.categories;
CREATE POLICY "Members can read categories" ON public.categories FOR SELECT TO authenticated
USING (public.is_active_shop_member() AND (organization_id = public.get_auth_org_id() OR organization_id IS NULL));

DROP POLICY IF EXISTS "Members can insert categories" ON public.categories;
CREATE POLICY "Members can insert categories" ON public.categories FOR INSERT TO authenticated
WITH CHECK (public.is_active_shop_member() AND (organization_id = public.get_auth_org_id() OR organization_id IS NULL));

DROP POLICY IF EXISTS "Members can update categories" ON public.categories;
CREATE POLICY "Members can update categories" ON public.categories FOR UPDATE TO authenticated
USING (public.is_active_shop_member() AND (organization_id = public.get_auth_org_id() OR organization_id IS NULL));

-- Category Aliases Policies
DROP POLICY IF EXISTS "Members can read aliases" ON public.category_aliases;
CREATE POLICY "Members can read aliases" ON public.category_aliases FOR SELECT TO authenticated
USING (public.is_active_shop_member());

DROP POLICY IF EXISTS "Members can manage aliases" ON public.category_aliases;
CREATE POLICY "Members can manage aliases" ON public.category_aliases FOR ALL TO authenticated
USING (public.is_active_shop_member());

-- Transactions Policies (Tenant-Scoped & Member-Only)
DROP POLICY IF EXISTS "Members can view transactions" ON public.transactions;
CREATE POLICY "Members can view transactions" ON public.transactions FOR SELECT TO authenticated
USING (
  public.is_active_shop_member() AND
  (organization_id = public.get_auth_org_id() OR (organization_id IS NULL AND created_by = auth.uid()))
);

DROP POLICY IF EXISTS "Members can record transactions" ON public.transactions;
CREATE POLICY "Members can record transactions" ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_shop_member() AND
  created_by = auth.uid() AND
  (organization_id = public.get_auth_org_id() OR organization_id IS NULL)
);

DROP POLICY IF EXISTS "Members can update transactions" ON public.transactions;
CREATE POLICY "Members can update transactions" ON public.transactions FOR UPDATE TO authenticated
USING (
  public.is_active_shop_member() AND
  (organization_id = public.get_auth_org_id() OR (organization_id IS NULL AND created_by = auth.uid()))
);

-- Audit Log Policy: Read-only for authenticated shop members in their organization
DROP POLICY IF EXISTS "Members can view audit log" ON public.audit_log;
CREATE POLICY "Members can view audit log" ON public.audit_log FOR SELECT TO authenticated
USING (public.is_active_shop_member() AND (organization_id = public.get_auth_org_id() OR organization_id IS NULL));

-- Review Queue Policy
DROP POLICY IF EXISTS "Members can manage review queue" ON public.review_queue;
CREATE POLICY "Members can manage review queue" ON public.review_queue FOR ALL TO authenticated
USING (public.is_active_shop_member() AND (organization_id = public.get_auth_org_id() OR organization_id IS NULL));

-- ============================================================================
-- AUTO-PROVISIONING ON SIGNUP (MULTI-SHOP SAAS SELF-SERVICE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_meta JSONB;
  v_org_id UUID;
  v_full_name TEXT;
  v_shop_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email, raw_user_meta_data
  INTO v_email, v_meta
  FROM auth.users
  WHERE id = v_uid;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;

  -- Check if user is already a member of a shop
  IF EXISTS (SELECT 1 FROM public.shop_members WHERE user_id = v_uid) THEN
    RETURN;
  END IF;

  v_full_name := COALESCE(
    NULLIF(v_meta->>'full_name', ''),
    NULLIF(v_meta->>'name', ''),
    split_part(v_email, '@', 1)
  );
  v_shop_name := COALESCE(
    NULLIF(v_meta->>'organization_name', ''),
    v_full_name || '''s Shop'
  );

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (v_shop_name, v_full_name, 'PKR', 'Rs.')
  RETURNING id INTO v_org_id;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  VALUES (v_uid, v_org_id, v_full_name, v_email, 'OWNER')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.categories (organization_id, name, kind, unusual_amount_limit_paisa, is_default, display_order)
  VALUES
    (v_org_id, 'Printing & Photocopy', 'income', 5000000, TRUE, 1),
    (v_org_id, 'Legal Stamp Paper', 'income', 30000000, FALSE, 2),
    (v_org_id, 'Lamination', 'income', 2000000, FALSE, 3),
    (v_org_id, 'Paper Stock Purchase', 'expense', 10000000, TRUE, 4),
    (v_org_id, 'Shop Supplies & Bills', 'expense', 5000000, FALSE, 5),
    (v_org_id, 'Stamp Paper Purchase', 'expense', 30000000, FALSE, 6)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================================
-- INITIAL SEED (DEFAULT GLOBAL CATEGORIES)
-- ============================================================================

INSERT INTO public.categories (id, organization_id, name, kind, unusual_amount_limit_paisa, is_default, display_order)
VALUES
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Printing & Photocopy', 'income', 5000000, TRUE, 1),
  ('c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Legal Stamp Paper', 'income', 30000000, FALSE, 2),
  ('c1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Lamination', 'income', 2000000, FALSE, 3),
  ('c1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Paper Stock Purchase', 'expense', 10000000, TRUE, 4),
  ('c1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Shop Supplies & Bills', 'expense', 5000000, FALSE, 5),
  ('c1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Stamp Paper Purchase', 'expense', 30000000, FALSE, 6)
ON CONFLICT DO NOTHING;

INSERT INTO public.category_aliases (category_id, alias)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'print'),
  ('c1000000-0000-0000-0000-000000000001', 'prnt'),
  ('c1000000-0000-0000-0000-000000000001', 'printing'),
  ('c1000000-0000-0000-0000-000000000001', 'copy'),
  ('c1000000-0000-0000-0000-000000000001', 'photocopy'),
  ('c1000000-0000-0000-0000-000000000001', 'fotocopy'),
  ('c1000000-0000-0000-0000-000000000001', 'xerox'),

  ('c1000000-0000-0000-0000-000000000002', 'stamp'),
  ('c1000000-0000-0000-0000-000000000002', 'stmp'),
  ('c1000000-0000-0000-0000-000000000002', 'stamp paper'),
  ('c1000000-0000-0000-0000-000000000002', 'affidavit'),
  ('c1000000-0000-0000-0000-000000000002', 'bayan'),

  ('c1000000-0000-0000-0000-000000000003', 'lamination'),
  ('c1000000-0000-0000-0000-000000000003', 'lmnation'),
  ('c1000000-0000-0000-0000-000000000003', 'lmnyon'),
  ('c1000000-0000-0000-0000-000000000003', 'lam'),

  ('c1000000-0000-0000-0000-000000000004', 'paper'),
  ('c1000000-0000-0000-0000-000000000004', 'a4 paper'),
  ('c1000000-0000-0000-0000-000000000004', 'legal paper'),
  ('c1000000-0000-0000-0000-000000000004', 'rim'),
  ('c1000000-0000-0000-0000-000000000004', 'ream'),

  ('c1000000-0000-0000-0000-000000000005', 'bill'),
  ('c1000000-0000-0000-0000-000000000005', 'electricity'),
  ('c1000000-0000-0000-0000-000000000005', 'toner'),
  ('c1000000-0000-0000-0000-000000000005', 'ink')
ON CONFLICT (alias) DO NOTHING;


-- Historical source: 20261004001000_sale_items_created_at.sql
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sale_items_organization_created_at
  ON public.sale_items (organization_id, created_at);

-- Historical source: 20261004002000_repair_shop_member_provisioning.sql
ALTER TABLE public.category_aliases
  ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.category_aliases AS aliases
SET organization_id = categories.organization_id
FROM public.categories AS categories
WHERE aliases.category_id = categories.id
  AND aliases.organization_id IS NULL;

ALTER TABLE public.category_aliases
  ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_id_organization
  ON public.categories (id, organization_id);

DO $$
BEGIN
  ALTER TABLE public.category_aliases
    DROP CONSTRAINT IF EXISTS ux_category_alias;
  ALTER TABLE public.category_aliases
    ADD CONSTRAINT category_aliases_category_shop_fk
    FOREIGN KEY (category_id, organization_id)
    REFERENCES public.categories (id, organization_id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_category_aliases_org_alias
  ON public.category_aliases (organization_id, alias);

CREATE INDEX IF NOT EXISTS idx_category_aliases_organization
  ON public.category_aliases (organization_id);

DROP POLICY IF EXISTS "Members can read aliases" ON public.category_aliases;
DROP POLICY IF EXISTS "Members can manage aliases" ON public.category_aliases;
CREATE POLICY "Members can manage aliases" ON public.category_aliases
  FOR ALL TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  )
  WITH CHECK (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  );

CREATE OR REPLACE FUNCTION public.seed_shop_defaults(target_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (
    organization_id, name, kind, unusual_amount_limit_paisa, is_default, display_order
  ) VALUES
    (target_org_id, 'Printing & Photocopy', 'income', 5000000, TRUE, 1),
    (target_org_id, 'Legal Stamp Paper', 'income', 30000000, FALSE, 2),
    (target_org_id, 'Lamination', 'income', 2000000, FALSE, 3),
    (target_org_id, 'Paper Stock Purchase', 'expense', 10000000, TRUE, 4),
    (target_org_id, 'Shop Supplies & Bills', 'expense', 5000000, FALSE, 5),
    (target_org_id, 'Stamp Paper Purchase', 'expense', 30000000, FALSE, 6)
  ON CONFLICT (organization_id, name) DO NOTHING;

  INSERT INTO public.category_aliases (organization_id, category_id, alias)
  SELECT target_org_id, categories.id, seeds.alias
  FROM (VALUES
    ('Printing & Photocopy', 'PRINT'),
    ('Printing & Photocopy', 'PRNT'),
    ('Printing & Photocopy', 'PRINTING'),
    ('Printing & Photocopy', 'PHOTOCOPY'),
    ('Printing & Photocopy', 'FOTOCOPY'),
    ('Printing & Photocopy', 'COPY'),
    ('Printing & Photocopy', 'PHOTOSTATE'),
    ('Printing & Photocopy', 'XEROX'),
    ('Legal Stamp Paper', 'STAMP'),
    ('Legal Stamp Paper', 'STMP'),
    ('Legal Stamp Paper', 'STAMPS'),
    ('Legal Stamp Paper', 'LEGAL STAMP'),
    ('Legal Stamp Paper', 'STAMP PAPER'),
    ('Legal Stamp Paper', 'AFFIDAVIT'),
    ('Legal Stamp Paper', 'BAYAN'),
    ('Lamination', 'LAMINATION'),
    ('Lamination', 'LMNYON'),
    ('Lamination', 'LMNATION'),
    ('Lamination', 'LAM'),
    ('Lamination', 'LAMNATION'),
    ('Paper Stock Purchase', 'PAPER'),
    ('Paper Stock Purchase', 'PAPR'),
    ('Paper Stock Purchase', 'A4 PAPER'),
    ('Paper Stock Purchase', 'RIM'),
    ('Paper Stock Purchase', 'REAMS'),
    ('Paper Stock Purchase', 'PAPER STOCK'),
    ('Shop Supplies & Bills', 'BILL'),
    ('Shop Supplies & Bills', 'SUPPLIES'),
    ('Shop Supplies & Bills', 'ELECTRICITY'),
    ('Shop Supplies & Bills', 'BIJLI'),
    ('Shop Supplies & Bills', 'CHAI'),
    ('Shop Supplies & Bills', 'TEA'),
    ('Shop Supplies & Bills', 'CLEANING'),
    ('Shop Supplies & Bills', 'SNACKS'),
    ('Stamp Paper Purchase', 'STAMP PURCHASE'),
    ('Stamp Paper Purchase', 'STAMP BUY'),
    ('Stamp Paper Purchase', 'BUY STAMP'),
    ('Stamp Paper Purchase', 'PURCHASE STAMP')
  ) AS seeds(category_name, alias)
  JOIN public.categories AS categories
    ON categories.organization_id = target_org_id
    AND categories.name = seeds.category_name
  ON CONFLICT (organization_id, alias) DO NOTHING;

  INSERT INTO public.payment_accounts (
    organization_id, name, type, current_balance, opening_balance, is_default, is_active
  )
  SELECT target_org_id, 'Cash Wallet', 'CASH', 0, 0, TRUE, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE organization_id = target_org_id
      AND is_default = TRUE
      AND is_active = TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_shop_defaults(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_profile_shop_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shop_members (
    user_id, organization_id, full_name, email, role, created_at
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    COALESCE(NULLIF(NEW.full_name, ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.role::TEXT, 'OWNER'),
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  PERFORM public.seed_shop_defaults(NEW.organization_id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_shop_membership() FROM PUBLIC, anon, authenticated;

INSERT INTO public.shop_members (
  user_id, organization_id, full_name, email, role, created_at
)
SELECT
  id,
  organization_id,
  COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)),
  email,
  COALESCE(role::TEXT, 'OWNER'),
  COALESCE(created_at, NOW())
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;

DO $$
DECLARE
  shop RECORD;
BEGIN
  FOR shop IN
    SELECT DISTINCT organization_id
    FROM public.shop_members
  LOOP
    PERFORM public.seed_shop_defaults(shop.organization_id);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_shop_membership ON public.profiles;
CREATE TRIGGER trg_sync_profile_shop_membership
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_shop_membership();

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  auth_email TEXT;
  metadata JSONB;
  new_org_id UUID;
  full_name_val TEXT;
  shop_name_val TEXT;
  profile_org_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email, raw_user_meta_data
  INTO auth_email, metadata
  FROM auth.users
  WHERE id = current_user_id;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  SELECT organization_id, full_name
  INTO profile_org_id, full_name_val
  FROM public.profiles
  WHERE id = current_user_id;

  IF profile_org_id IS NULL THEN
    full_name_val := COALESCE(
      NULLIF(full_name_val, ''),
      NULLIF(metadata->>'full_name', ''),
      NULLIF(metadata->>'name', ''),
      split_part(auth_email, '@', 1)
    );
    shop_name_val := COALESCE(
      NULLIF(metadata->>'shop_name', ''),
      NULLIF(metadata->>'organization_name', ''),
      full_name_val || '''s Shop'
    );

    INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
    VALUES (shop_name_val, full_name_val, 'PKR', 'Rs.')
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
    VALUES (current_user_id, auth_email, full_name_val, 'OWNER', new_org_id, TRUE)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      is_active = TRUE;

    profile_org_id := new_org_id;
  END IF;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  SELECT id, organization_id, COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)), email, role::TEXT
  FROM public.profiles
  WHERE id = current_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  SELECT organization_id, id, role, TRUE
  FROM public.profiles
  WHERE id = current_user_id
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  PERFORM public.seed_shop_defaults(profile_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
SELECT organization_id, id, role, TRUE
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = TRUE;

CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  shop_name TEXT;
  owner_name TEXT;
BEGIN
  SELECT organization_id INTO new_org_id
  FROM public.profiles
  WHERE id = NEW.id;

  IF new_org_id IS NOT NULL THEN
    PERFORM public.seed_shop_defaults(new_org_id);
    RETURN NEW;
  END IF;

  owner_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  shop_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'shop_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'organization_name', ''),
    owner_name || '''s Shop'
  );

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (shop_name, owner_name, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
  VALUES (NEW.id, NEW.email, owner_name, 'OWNER', new_org_id, TRUE);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, NEW.id, 'OWNER', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  PERFORM public.seed_shop_defaults(new_org_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_profile_for_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org_id UUID;
BEGIN
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE id = target_user_id;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Existing profile has no shop organization';
  END IF;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  SELECT id, organization_id, COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)), email, role::TEXT
  FROM public.profiles
  WHERE id = target_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  SELECT organization_id, id, role, TRUE
  FROM public.profiles
  WHERE id = target_user_id
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  PERFORM public.seed_shop_defaults(target_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile_for_user(UUID) FROM PUBLIC, anon, authenticated;

-- Historical source: 20261004003000_account_balances_and_postings.sql
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'investment';

ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS balance_paisa BIGINT;
UPDATE public.payment_accounts
SET balance_paisa = ROUND(COALESCE(current_balance, opening_balance, 0) * 100)::BIGINT
WHERE balance_paisa IS NULL;
ALTER TABLE public.payment_accounts
  ALTER COLUMN balance_paisa SET DEFAULT 0,
  ALTER COLUMN balance_paisa SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_accounts_id_org
  ON public.payment_accounts (id, organization_id);

CREATE OR REPLACE FUNCTION public.sync_payment_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_paisa = 0 AND (COALESCE(NEW.current_balance, 0) <> 0 OR COALESCE(NEW.opening_balance, 0) <> 0) THEN
      NEW.balance_paisa := ROUND(COALESCE(NULLIF(NEW.current_balance, 0), NEW.opening_balance, 0) * 100)::BIGINT;
    END IF;
    NEW.current_balance := NEW.balance_paisa::NUMERIC / 100;
  ELSIF NEW.balance_paisa IS DISTINCT FROM OLD.balance_paisa THEN
    NEW.current_balance := NEW.balance_paisa::NUMERIC / 100;
  ELSIF NEW.current_balance IS DISTINCT FROM OLD.current_balance THEN
    NEW.balance_paisa := ROUND(NEW.current_balance * 100)::BIGINT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_account_balance ON public.payment_accounts;
CREATE TRIGGER trg_sync_payment_account_balance
BEFORE INSERT OR UPDATE OF balance_paisa, current_balance ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_account_balance();

INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default, is_active)
SELECT shops.id, 'Cash Wallet', 'CASH', 0, 0, TRUE, TRUE
FROM public.organizations AS shops
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_accounts AS accounts
  WHERE accounts.organization_id = shops.id AND accounts.is_default AND accounts.is_active
);

INSERT INTO public.payment_accounts (organization_id, name, type, current_balance, opening_balance, is_default, is_active)
SELECT DISTINCT transactions.organization_id, 'Cash Wallet', 'CASH', 0, 0, TRUE, TRUE
FROM public.transactions AS transactions
WHERE transactions.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_accounts AS accounts
    WHERE accounts.organization_id = transactions.organization_id AND accounts.is_default AND accounts.is_active
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id UUID,
  ADD COLUMN IF NOT EXISTS account_posted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.transactions AS transactions
SET account_id = (
  SELECT payment_accounts.id
  FROM public.payment_accounts AS payment_accounts
  WHERE payment_accounts.organization_id = transactions.organization_id
    AND payment_accounts.is_default AND payment_accounts.is_active
  ORDER BY payment_accounts.created_at, payment_accounts.id
  LIMIT 1
)
WHERE transactions.account_id IS NULL;

ALTER TABLE public.transactions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_account_org_fk
  FOREIGN KEY (account_id, organization_id)
  REFERENCES public.payment_accounts (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org_account_date
  ON public.transactions (organization_id, account_id, business_date);

CREATE TABLE IF NOT EXISTS public.account_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id),
  transfer_id UUID REFERENCES public.account_transfers(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'OPENING_BALANCE', 'INCOME', 'EXPENSE', 'CAPITAL', 'INVESTMENT',
    'WITHDRAWAL', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL'
  )),
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa <> 0),
  balance_after_paisa BIGINT NOT NULL,
  business_date DATE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (account_id, organization_id) REFERENCES public.payment_accounts (id, organization_id),
  CHECK (transaction_id IS NULL OR transfer_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_account_ledger_org_account_date
  ON public.account_ledger_entries (organization_id, account_id, business_date, created_at);
ALTER TABLE public.account_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_ledger_entries FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_ledger_entries TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.account_ledger_entries FROM authenticated, anon, public;
CREATE POLICY account_ledger_entries_select ON public.account_ledger_entries
  FOR SELECT TO authenticated
  USING (public.is_active_shop_member() AND organization_id = public.get_auth_org_id());

CREATE OR REPLACE FUNCTION private.record_account_opening_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.balance_paisa > 0 THEN
    INSERT INTO public.account_ledger_entries (
      organization_id, account_id, entry_type, amount_paisa,
      balance_after_paisa, business_date, created_by
    ) VALUES (
      NEW.organization_id, NEW.id, 'OPENING_BALANCE', NEW.balance_paisa,
      NEW.balance_paisa, (NOW() AT TIME ZONE 'Asia/Karachi')::DATE, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_account_opening_balance ON public.payment_accounts;
CREATE TRIGGER trg_record_account_opening_balance
AFTER INSERT ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION private.record_account_opening_balance();

REVOKE UPDATE (current_balance, balance_paisa, opening_balance)
  ON public.payment_accounts FROM authenticated;

CREATE OR REPLACE FUNCTION private.apply_account_delta(
  target_account_id UUID, target_org_id UUID, delta_paisa BIGINT,
  target_entry_type TEXT, target_date DATE, target_user_id UUID,
  target_transaction_id UUID DEFAULT NULL, target_transfer_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF delta_paisa = 0 THEN RETURN; END IF;
  UPDATE public.payment_accounts
  SET balance_paisa = balance_paisa + delta_paisa,
      current_balance = (balance_paisa + delta_paisa)::NUMERIC / 100
  WHERE id = target_account_id AND organization_id = target_org_id
    AND is_active AND balance_paisa + delta_paisa >= 0
  RETURNING balance_paisa INTO new_balance;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = target_account_id AND organization_id = target_org_id) THEN
      RAISE EXCEPTION 'Insufficient account balance';
    END IF;
    RAISE EXCEPTION 'Account does not belong to this shop or is inactive';
  END IF;
  INSERT INTO public.account_ledger_entries (
    organization_id, account_id, transaction_id, transfer_id, entry_type,
    amount_paisa, balance_after_paisa, business_date, created_by
  ) VALUES (
    target_org_id, target_account_id, target_transaction_id, target_transfer_id,
    target_entry_type, delta_paisa, new_balance, target_date, target_user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION private.apply_account_delta(UUID, UUID, BIGINT, TEXT, DATE, UUID, UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.ledger_transaction_delta(
  transaction_type public.transaction_type, amount_paisa BIGINT,
  adjustment_dir public.adjustment_direction
)
RETURNS BIGINT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  CASE transaction_type
    WHEN 'income' THEN RETURN amount_paisa;
    WHEN 'capital_in' THEN RETURN amount_paisa;
    WHEN 'investment' THEN RETURN amount_paisa;
    WHEN 'expense' THEN RETURN -amount_paisa;
    WHEN 'withdrawal' THEN RETURN -amount_paisa;
    WHEN 'adjustment' THEN
      IF adjustment_dir = 'in' THEN RETURN amount_paisa; END IF;
      IF adjustment_dir = 'out' THEN RETURN -amount_paisa; END IF;
      RAISE EXCEPTION 'Adjustment direction is required';
    ELSE RAISE EXCEPTION 'Unsupported account transaction type';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION private.protect_transaction_account_posting()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.account_posted := TRUE;
  ELSE NEW.account_posted := OLD.account_posted;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_transaction_account_posting ON public.transactions;
CREATE TRIGGER trg_protect_transaction_account_posting
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.protect_transaction_account_posting();

CREATE OR REPLACE FUNCTION private.post_ledger_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  old_delta BIGINT;
  new_delta BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      new_delta := private.ledger_transaction_delta(NEW.type, NEW.amount_paisa, NEW.adjustment_dir);
      PERFORM private.apply_account_delta(
        NEW.account_id, NEW.organization_id, new_delta,
        CASE NEW.type WHEN 'capital_in' THEN 'CAPITAL' WHEN 'investment' THEN 'INVESTMENT'
          WHEN 'withdrawal' THEN 'WITHDRAWAL' WHEN 'adjustment' THEN 'ADJUSTMENT' ELSE UPPER(NEW.type::TEXT) END,
        NEW.business_date, NEW.created_by, NEW.id, NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NOT OLD.account_posted THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status AND NEW.account_id = OLD.account_id
     AND NEW.amount_paisa = OLD.amount_paisa AND NEW.type = OLD.type
     AND NEW.adjustment_dir IS NOT DISTINCT FROM OLD.adjustment_dir THEN RETURN NEW; END IF;

  IF OLD.status = 'active' THEN
    old_delta := private.ledger_transaction_delta(OLD.type, OLD.amount_paisa, OLD.adjustment_dir);
    PERFORM private.apply_account_delta(
      OLD.account_id, OLD.organization_id, -old_delta, 'REVERSAL',
      OLD.business_date, COALESCE(auth.uid(), OLD.created_by), OLD.id, NULL
    );
  END IF;
  IF NEW.status = 'active' THEN
    new_delta := private.ledger_transaction_delta(NEW.type, NEW.amount_paisa, NEW.adjustment_dir);
    PERFORM private.apply_account_delta(
      NEW.account_id, NEW.organization_id, new_delta,
      CASE NEW.type WHEN 'capital_in' THEN 'CAPITAL' WHEN 'investment' THEN 'INVESTMENT'
        WHEN 'withdrawal' THEN 'WITHDRAWAL' WHEN 'adjustment' THEN 'ADJUSTMENT' ELSE UPPER(NEW.type::TEXT) END,
      NEW.business_date, COALESCE(auth.uid(), NEW.created_by), NEW.id, NULL
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_ledger_transaction ON public.transactions;
CREATE TRIGGER trg_post_ledger_transaction
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.post_ledger_transaction();

ALTER TABLE public.account_transfers
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS account_posted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.account_transfers ADD CONSTRAINT account_transfers_status_check
  CHECK (status IN ('ACTIVE', 'VOIDED'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_transfers_idempotency
  ON public.account_transfers (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION private.protect_account_transfer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_account_id = NEW.to_account_id THEN RAISE EXCEPTION 'Source and destination accounts must be different'; END IF;
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be greater than zero'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.account_posted := TRUE;
    NEW.date := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
  ELSE
    NEW.account_posted := OLD.account_posted;
    IF NEW.status = 'VOIDED' AND COALESCE(NULLIF(BTRIM(NEW.void_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'A reason is required to void a transfer';
    END IF;
    IF NEW.status = 'VOIDED' AND NEW.voided_at IS NULL THEN
      NEW.voided_at := NOW(); NEW.voided_by := COALESCE(auth.uid(), OLD.voided_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_account_transfer ON public.account_transfers;
CREATE TRIGGER trg_protect_account_transfer
BEFORE INSERT OR UPDATE ON public.account_transfers
FOR EACH ROW EXECUTE FUNCTION private.protect_account_transfer();

CREATE OR REPLACE FUNCTION private.post_account_transfer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  transfer_paisa BIGINT := ROUND(NEW.amount * 100)::BIGINT;
  old_transfer_paisa BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status
     AND NEW.from_account_id = OLD.from_account_id AND NEW.to_account_id = OLD.to_account_id
     AND NEW.amount = OLD.amount THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT OLD.account_posted THEN RETURN NEW; END IF;

  PERFORM id FROM public.payment_accounts
  WHERE id IN (NEW.from_account_id, NEW.to_account_id)
  ORDER BY id FOR UPDATE;

  IF TG_OP = 'UPDATE' AND OLD.account_posted AND OLD.status = 'ACTIVE' THEN
    old_transfer_paisa := ROUND(OLD.amount * 100)::BIGINT;
    PERFORM private.apply_account_delta(OLD.from_account_id, OLD.organization_id, old_transfer_paisa,
      'REVERSAL', OLD.date, COALESCE(auth.uid(), OLD.created_by::UUID), NULL, OLD.id);
    PERFORM private.apply_account_delta(OLD.to_account_id, OLD.organization_id, -old_transfer_paisa,
      'REVERSAL', OLD.date, COALESCE(auth.uid(), OLD.created_by::UUID), NULL, OLD.id);
  END IF;

  IF NEW.status = 'ACTIVE' THEN
    PERFORM private.apply_account_delta(NEW.from_account_id, NEW.organization_id, -transfer_paisa,
      'TRANSFER_OUT', NEW.date, COALESCE(auth.uid(), NEW.created_by::UUID), NULL, NEW.id);
    PERFORM private.apply_account_delta(NEW.to_account_id, NEW.organization_id, transfer_paisa,
      'TRANSFER_IN', NEW.date, COALESCE(auth.uid(), NEW.created_by::UUID), NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_account_transfer ON public.account_transfers;
CREATE TRIGGER trg_post_account_transfer
AFTER INSERT OR UPDATE ON public.account_transfers
FOR EACH ROW EXECUTE FUNCTION private.post_account_transfer();

INSERT INTO public.account_ledger_entries (
  organization_id, account_id, entry_type, amount_paisa,
  balance_after_paisa, business_date, created_by
)
SELECT organization_id, id, 'OPENING_BALANCE', balance_paisa, balance_paisa,
  (NOW() AT TIME ZONE 'Asia/Karachi')::DATE, NULL
FROM public.payment_accounts
WHERE balance_paisa <> 0;

-- Historical source: 20261004004000_transaction_drafts.sql
CREATE TABLE public.transaction_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa > 0),
  category_id UUID REFERENCES public.categories(id),
  adjustment_dir public.adjustment_direction,
  business_date DATE NOT NULL,
  device_entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  raw_text TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_draft_adjustment_requires_note CHECK (
    type != 'adjustment' OR (
      note IS NOT NULL AND length(trim(note)) > 0 AND adjustment_dir IS NOT NULL
    )
  )
);

CREATE INDEX idx_transaction_drafts_org_date
  ON public.transaction_drafts (organization_id, business_date, device_entry_time);

ALTER TABLE public.transaction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_drafts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.transaction_drafts TO authenticated;
REVOKE DELETE, TRUNCATE ON public.transaction_drafts FROM authenticated, anon, public;

CREATE POLICY transaction_drafts_select
  ON public.transaction_drafts FOR SELECT TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  );
CREATE POLICY transaction_drafts_insert
  ON public.transaction_drafts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
    AND created_by = auth.uid()
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.categories
        WHERE id = category_id AND organization_id = transaction_drafts.organization_id
      )
    )
  );
CREATE POLICY transaction_drafts_update
  ON public.transaction_drafts FOR UPDATE TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
    AND created_by = auth.uid()
    AND (
      category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.categories
        WHERE id = category_id AND organization_id = transaction_drafts.organization_id
      )
    )
  );
CREATE POLICY transaction_drafts_delete
  ON public.transaction_drafts FOR DELETE TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  );

CREATE OR REPLACE FUNCTION public.post_transaction_draft(
  draft_id UUID,
  selected_account_id UUID
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  draft public.transaction_drafts%ROWTYPE;
  posted_transaction public.transactions%ROWTYPE;
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to post a transaction draft';
  END IF;

  SELECT * INTO draft
  FROM public.transaction_drafts
  WHERE id = draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft_id::TEXT;
    IF FOUND THEN
      RETURN posted_transaction;
    END IF;
    RAISE EXCEPTION 'Transaction draft was not found';
  END IF;

  IF NOT public.is_active_shop_member()
     OR draft.organization_id <> public.get_auth_org_id() THEN
    RAISE EXCEPTION 'Transaction draft does not belong to an active shop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE id = selected_account_id
      AND organization_id = draft.organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Selected account does not belong to this shop or is inactive';
  END IF;

  IF draft.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = draft.category_id AND organization_id = draft.organization_id
  ) THEN
    RAISE EXCEPTION 'Transaction category does not belong to this shop';
  END IF;

  INSERT INTO public.transactions (
    organization_id, type, amount_paisa, category_id, account_id,
    adjustment_dir, business_date, device_entry_time, note, raw_text,
    status, idempotency_key, created_by, created_by_name
  ) VALUES (
    draft.organization_id, draft.type, draft.amount_paisa, draft.category_id,
    selected_account_id, draft.adjustment_dir, draft.business_date,
    draft.device_entry_time, draft.note, draft.raw_text, 'active',
    'draft-' || draft.id::TEXT, current_user_id, draft.created_by_name
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO posted_transaction;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft.id::TEXT
      AND organization_id = draft.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction draft could not be posted';
    END IF;
  END IF;

  DELETE FROM public.transaction_drafts WHERE id = draft.id;
  RETURN posted_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.post_transaction_draft(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_transaction_draft(UUID, UUID) TO authenticated;


-- Historical source: 20261004005000_tenant_scoped_category_aliases.sql
ALTER TABLE public.category_aliases
  ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.category_aliases AS aliases
SET organization_id = categories.organization_id
FROM public.categories AS categories
WHERE aliases.category_id = categories.id
  AND aliases.organization_id IS NULL;

ALTER TABLE public.category_aliases
  ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_id_organization
  ON public.categories (id, organization_id);

ALTER TABLE public.category_aliases
  DROP CONSTRAINT IF EXISTS ux_category_alias;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_aliases_category_shop_fk'
      AND conrelid = 'public.category_aliases'::regclass
  ) THEN
    ALTER TABLE public.category_aliases
      ADD CONSTRAINT category_aliases_category_shop_fk
      FOREIGN KEY (category_id, organization_id)
      REFERENCES public.categories (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_category_aliases_org_alias
  ON public.category_aliases (organization_id, alias);
CREATE INDEX IF NOT EXISTS idx_category_aliases_organization
  ON public.category_aliases (organization_id);

DROP POLICY IF EXISTS "Members can read aliases" ON public.category_aliases;
DROP POLICY IF EXISTS "Members can manage aliases" ON public.category_aliases;
DROP POLICY IF EXISTS category_aliases_tenant_access ON public.category_aliases;
CREATE POLICY category_aliases_tenant_access
  ON public.category_aliases FOR ALL TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  )
  WITH CHECK (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
  );


-- Historical source: 20261004006000_repair_shop_provisioning.sql
CREATE OR REPLACE FUNCTION public.seed_shop_defaults(target_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (
    organization_id, name, kind, unusual_amount_limit_paisa, is_default, display_order
  ) VALUES
    (target_org_id, 'Printing & Photocopy', 'income', 5000000, TRUE, 1),
    (target_org_id, 'Legal Stamp Paper', 'income', 30000000, FALSE, 2),
    (target_org_id, 'Lamination', 'income', 2000000, FALSE, 3),
    (target_org_id, 'Paper Stock Purchase', 'expense', 10000000, TRUE, 4),
    (target_org_id, 'Shop Supplies & Bills', 'expense', 5000000, FALSE, 5),
    (target_org_id, 'Stamp Paper Purchase', 'expense', 30000000, FALSE, 6)
  ON CONFLICT (organization_id, name) DO NOTHING;

  INSERT INTO public.category_aliases (organization_id, category_id, alias)
  SELECT target_org_id, categories.id, seeds.alias
  FROM (VALUES
    ('Printing & Photocopy', 'PRINT'),
    ('Printing & Photocopy', 'PRNT'),
    ('Printing & Photocopy', 'PRINTING'),
    ('Printing & Photocopy', 'PHOTOCOPY'),
    ('Printing & Photocopy', 'FOTOCOPY'),
    ('Printing & Photocopy', 'COPY'),
    ('Printing & Photocopy', 'PHOTOSTATE'),
    ('Printing & Photocopy', 'XEROX'),
    ('Legal Stamp Paper', 'STAMP'),
    ('Legal Stamp Paper', 'STMP'),
    ('Legal Stamp Paper', 'STAMPS'),
    ('Legal Stamp Paper', 'LEGAL STAMP'),
    ('Legal Stamp Paper', 'STAMP PAPER'),
    ('Legal Stamp Paper', 'AFFIDAVIT'),
    ('Legal Stamp Paper', 'BAYAN'),
    ('Lamination', 'LAMINATION'),
    ('Lamination', 'LMNYON'),
    ('Lamination', 'LMNATION'),
    ('Lamination', 'LAM'),
    ('Lamination', 'LAMNATION'),
    ('Paper Stock Purchase', 'PAPER'),
    ('Paper Stock Purchase', 'PAPR'),
    ('Paper Stock Purchase', 'A4 PAPER'),
    ('Paper Stock Purchase', 'RIM'),
    ('Paper Stock Purchase', 'REAMS'),
    ('Paper Stock Purchase', 'PAPER STOCK'),
    ('Shop Supplies & Bills', 'BILL'),
    ('Shop Supplies & Bills', 'SUPPLIES'),
    ('Shop Supplies & Bills', 'ELECTRICITY'),
    ('Shop Supplies & Bills', 'BIJLI'),
    ('Shop Supplies & Bills', 'CHAI'),
    ('Shop Supplies & Bills', 'TEA'),
    ('Shop Supplies & Bills', 'CLEANING'),
    ('Shop Supplies & Bills', 'SNACKS'),
    ('Stamp Paper Purchase', 'STAMP PURCHASE'),
    ('Stamp Paper Purchase', 'STAMP BUY'),
    ('Stamp Paper Purchase', 'BUY STAMP'),
    ('Stamp Paper Purchase', 'PURCHASE STAMP')
  ) AS seeds(category_name, alias)
  JOIN public.categories AS categories
    ON categories.organization_id = target_org_id
    AND categories.name = seeds.category_name
  ON CONFLICT (organization_id, alias) DO NOTHING;

  INSERT INTO public.payment_accounts (
    organization_id, name, type, current_balance, opening_balance, is_default, is_active
  )
  SELECT target_org_id, 'Cash Wallet', 'CASH', 0, 0, TRUE, TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE organization_id = target_org_id
      AND is_default = TRUE
      AND is_active = TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_shop_defaults(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_profile_shop_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shop_members (
    user_id, organization_id, full_name, email, role, created_at
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    COALESCE(NULLIF(NEW.full_name, ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.role::TEXT, 'OWNER'),
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  PERFORM public.seed_shop_defaults(NEW.organization_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_shop_membership() FROM PUBLIC, anon, authenticated;

INSERT INTO public.shop_members (
  user_id, organization_id, full_name, email, role, created_at
)
SELECT
  id,
  organization_id,
  COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)),
  email,
  COALESCE(role::TEXT, 'OWNER'),
  COALESCE(created_at, NOW())
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;

DO $$
DECLARE
  shop RECORD;
BEGIN
  FOR shop IN
    SELECT DISTINCT organization_id
    FROM public.shop_members
  LOOP
    PERFORM public.seed_shop_defaults(shop.organization_id);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_shop_membership ON public.profiles;
CREATE TRIGGER trg_sync_profile_shop_membership
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_shop_membership();

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  auth_email TEXT;
  metadata JSONB;
  new_org_id UUID;
  full_name_val TEXT;
  shop_name_val TEXT;
  profile_org_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email, raw_user_meta_data
  INTO auth_email, metadata
  FROM auth.users
  WHERE id = current_user_id;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  SELECT organization_id, full_name
  INTO profile_org_id, full_name_val
  FROM public.profiles
  WHERE id = current_user_id;

  IF profile_org_id IS NULL THEN
    full_name_val := COALESCE(
      NULLIF(full_name_val, ''),
      NULLIF(metadata->>'full_name', ''),
      NULLIF(metadata->>'name', ''),
      split_part(auth_email, '@', 1)
    );
    shop_name_val := COALESCE(
      NULLIF(metadata->>'shop_name', ''),
      NULLIF(metadata->>'organization_name', ''),
      full_name_val || '''s Shop'
    );

    INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
    VALUES (shop_name_val, full_name_val, 'PKR', 'Rs.')
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
    VALUES (current_user_id, auth_email, full_name_val, 'OWNER', new_org_id, TRUE)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      is_active = TRUE;

    profile_org_id := new_org_id;
  END IF;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  SELECT id, organization_id, COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)), email, role::TEXT
  FROM public.profiles
  WHERE id = current_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  SELECT organization_id, id, role, TRUE
  FROM public.profiles
  WHERE id = current_user_id
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  PERFORM public.seed_shop_defaults(profile_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
SELECT organization_id, id, role, TRUE
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = TRUE;

CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  shop_name TEXT;
  owner_name TEXT;
BEGIN
  SELECT organization_id INTO new_org_id
  FROM public.profiles
  WHERE id = NEW.id;

  IF new_org_id IS NOT NULL THEN
    PERFORM public.seed_shop_defaults(new_org_id);
    RETURN NEW;
  END IF;

  owner_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  shop_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'shop_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'organization_name', ''),
    owner_name || '''s Shop'
  );

  INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
  VALUES (shop_name, owner_name, 'PKR', 'Rs.')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
  VALUES (NEW.id, NEW.email, owner_name, 'OWNER', new_org_id, TRUE);

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (new_org_id, NEW.id, 'OWNER', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  PERFORM public.seed_shop_defaults(new_org_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_profile_for_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org_id UUID;
BEGIN
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE id = target_user_id;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Existing profile has no shop organization';
  END IF;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  SELECT id, organization_id, COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)), email, role::TEXT
  FROM public.profiles
  WHERE id = target_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  SELECT organization_id, id, role, TRUE
  FROM public.profiles
  WHERE id = target_user_id
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  PERFORM public.seed_shop_defaults(target_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile_for_user(UUID) FROM PUBLIC, anon, authenticated;


-- Historical source: 20261004007000_transaction_integrity_and_authorization.sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_id_organization
  ON public.categories (id, organization_id);

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_organization_fk
  FOREIGN KEY (category_id, organization_id)
  REFERENCES public.categories (id, organization_id);

ALTER TABLE public.transaction_drafts
  ADD CONSTRAINT transaction_drafts_category_organization_fk
  FOREIGN KEY (category_id, organization_id)
  REFERENCES public.categories (id, organization_id);

CREATE OR REPLACE FUNCTION private.enforce_transaction_void_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, private, auth
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'voided' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'An authenticated shop member is required to void a transaction';
    END IF;
    IF COALESCE(NULLIF(BTRIM(NEW.void_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'A non-empty void reason is required';
    END IF;
    NEW.voided_by := auth.uid();
    NEW.voided_at := NOW();
  ELSIF OLD.status = 'voided' AND NEW.status = 'active' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'An authenticated shop member is required to restore a transaction';
    END IF;
    NEW.void_reason := NULL;
    NEW.voided_by := NULL;
    NEW.voided_at := NULL;
  ELSIF OLD.status = 'voided' THEN
    NEW.void_reason := OLD.void_reason;
    NEW.voided_by := OLD.voided_by;
    NEW.voided_at := OLD.voided_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_enforce_transaction_void_attribution ON public.transactions;
CREATE TRIGGER trg_a_enforce_transaction_void_attribution
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.enforce_transaction_void_attribution();

DROP POLICY IF EXISTS "Members can update transactions" ON public.transactions;
CREATE POLICY "Members can update transactions" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
    AND EXISTS (
      SELECT 1 FROM public.shop_members AS member
      WHERE member.user_id = auth.uid()
        AND member.organization_id = transactions.organization_id
        AND member.role IN ('OWNER', 'MANAGER')
    )
  )
  WITH CHECK (
    public.is_active_shop_member()
    AND organization_id = public.get_auth_org_id()
    AND EXISTS (
      SELECT 1 FROM public.shop_members AS member
      WHERE member.user_id = auth.uid()
        AND member.organization_id = transactions.organization_id
        AND member.role IN ('OWNER', 'MANAGER')
    )
  );


-- Historical source: 20261011000000_allow_account_overdraft_and_resilient_drafts.sql
-- Migration: Allow Account Overdraft and Resilient Transaction Drafts
-- Fixes:
-- 1. Permits expenses to be recorded against accounts starting at balance 0 or negative balance (overdraft)
--    by removing the balance_paisa + delta_paisa >= 0 guard in private.apply_account_delta.
-- 2. Makes public.post_transaction_draft resilient: if draft.category_id does not exist for the shop,
--    it defaults to NULL rather than aborting the transaction.
-- 3. Drops redundant single-column foreign key constraints that cause PostgREST PGRST201 embedding errors.

CREATE OR REPLACE FUNCTION private.apply_account_delta(
  target_account_id UUID, target_org_id UUID, delta_paisa BIGINT,
  target_entry_type TEXT, target_date DATE, target_user_id UUID,
  target_transaction_id UUID DEFAULT NULL, target_transfer_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF delta_paisa = 0 THEN RETURN; END IF;
  UPDATE public.payment_accounts
  SET balance_paisa = balance_paisa + delta_paisa,
      current_balance = (balance_paisa + delta_paisa)::NUMERIC / 100
  WHERE id = target_account_id AND organization_id = target_org_id AND is_active
  RETURNING balance_paisa INTO new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account does not belong to this shop or is inactive';
  END IF;
  INSERT INTO public.account_ledger_entries (
    organization_id, account_id, transaction_id, transfer_id, entry_type,
    amount_paisa, balance_after_paisa, business_date, created_by
  ) VALUES (
    target_org_id, target_account_id, target_transaction_id, target_transfer_id,
    target_entry_type, delta_paisa, new_balance, target_date, target_user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION private.apply_account_delta(UUID, UUID, BIGINT, TEXT, DATE, UUID, UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.post_transaction_draft(
  draft_id UUID,
  selected_account_id UUID
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  draft public.transaction_drafts%ROWTYPE;
  posted_transaction public.transactions%ROWTYPE;
  current_user_id UUID := auth.uid();
  valid_category_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to post a transaction draft';
  END IF;

  SELECT * INTO draft
  FROM public.transaction_drafts
  WHERE id = draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft_id::TEXT;
    IF FOUND THEN
      RETURN posted_transaction;
    END IF;
    RAISE EXCEPTION 'Transaction draft was not found';
  END IF;

  IF NOT public.is_active_shop_member()
     OR draft.organization_id <> public.get_auth_org_id() THEN
    RAISE EXCEPTION 'Transaction draft does not belong to an active shop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_accounts
    WHERE id = selected_account_id
      AND organization_id = draft.organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Selected account does not belong to this shop or is inactive';
  END IF;

  -- Validate category: If category exists for this shop, link it; otherwise gracefully fall back to NULL
  valid_category_id := NULL;
  IF draft.category_id IS NOT NULL THEN
    SELECT id INTO valid_category_id
    FROM public.categories
    WHERE id = draft.category_id AND organization_id = draft.organization_id;
  END IF;

  INSERT INTO public.transactions (
    organization_id, type, amount_paisa, category_id, account_id,
    adjustment_dir, business_date, device_entry_time, note, raw_text,
    status, idempotency_key, created_by, created_by_name
  ) VALUES (
    draft.organization_id, draft.type, draft.amount_paisa, valid_category_id,
    selected_account_id, draft.adjustment_dir, draft.business_date,
    draft.device_entry_time, draft.note, draft.raw_text, 'active',
    'draft-' || draft.id::TEXT, current_user_id, draft.created_by_name
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO posted_transaction;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft.id::TEXT
      AND organization_id = draft.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction draft could not be posted';
    END IF;
  END IF;

  DELETE FROM public.transaction_drafts WHERE id = draft.id;
  RETURN posted_transaction;
END;
$$;

-- Drop legacy duplicate single-column foreign keys to prevent PostgREST PGRST201 embedding collisions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_category_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_category_organization_fk'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_category_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_drafts_category_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_drafts_category_organization_fk'
  ) THEN
    ALTER TABLE public.transaction_drafts DROP CONSTRAINT transaction_drafts_category_id_fkey;
  END IF;
END $$;


-- Historical source: 20261014000000_regional_settings.sql
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
