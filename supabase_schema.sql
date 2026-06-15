-- Vignan's Institute of Information Technology (VIIT)
-- Enterprise Asset Management System (AMS)
-- Supabase PostgreSQL Relational Database Schema (DDL)

-- =========================================================================
-- 1. Create Custom ENUM Types for strict domain constraints
-- =========================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'super_admin', 
            'asset_manager', 
            'employee', 
            'auditor', 
            'maintenance_team',
            'web_developer'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
        CREATE TYPE asset_status AS ENUM (
            'available', 
            'allocated', 
            'maintenance', 
            'disposed',
            'return_pending'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        CREATE TYPE request_status AS ENUM (
            'pending', 
            'approved', 
            'rejected'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'repair_status') THEN
        CREATE TYPE repair_status AS ENUM (
            'reported', 
            'in_progress', 
            'resolved', 
            'unrepairable'
        );
    END IF;
END $$;

-- =========================================================================
-- 2. Create Tables (Matching strictly to TypeScript DatabaseSchema)
-- =========================================================================

-- Table: users (Authentication and Identity)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_plain TEXT,
  role user_role NOT NULL DEFAULT 'employee',
  department TEXT NOT NULL,
  employee_type TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  read_notifications JSONB
);

-- Table: assets (Inventory and Status tracking)
CREATE TABLE IF NOT EXISTS public.assets (
  id BIGINT PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status asset_status NOT NULL DEFAULT 'available',
  purchase_date TEXT NOT NULL,
  cost NUMERIC NOT NULL,
  serial_number TEXT,
  location TEXT NOT NULL,
  qr_code TEXT,
  warranty_expiry TEXT,
  assigned_to BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  custom_fields JSONB,
  images JSONB
);

-- Table: requests (Asset Allocation Requests)
CREATE TABLE IF NOT EXISTS public.requests (
  id BIGINT PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  request_date TEXT NOT NULL,
  approved_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  approval_date TEXT,
  return_date TEXT,
  asset_name TEXT,
  user_name TEXT,
  expected_return_date TEXT,
  approver_name TEXT,
  comments TEXT
);

-- Table: maintenance_logs (Engineering and repair track)
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id BIGINT PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  reported_by BIGINT NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  issue_description TEXT NOT NULL,
  repair_status repair_status NOT NULL DEFAULT 'reported',
  cost NUMERIC NOT NULL DEFAULT 0.00,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table: audits (Audit logs for system compliance - matching TS representation)
CREATE TABLE IF NOT EXISTS public.audits (
  id BIGINT PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action_type TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id BIGINT,
  details TEXT NOT NULL,
  performed_at TEXT NOT NULL
);

-- Table: suggestions (User feedback and issue reports)
CREATE TABLE IF NOT EXISTS public.suggestions (
  id BIGINT PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Table: budgets (Capital budgeting overrides)
CREATE TABLE IF NOT EXISTS public.budgets (
  id TEXT PRIMARY KEY,
  "grossCapitalValuationOverride" NUMERIC,
  "cumulativeOutlaysOverride" NUMERIC
);

-- =========================================================================
-- 3. Temporarily Disable RLS (Row Level Security) 
--    (Optional: This ensures local standalone servers have full access)
-- =========================================================================
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets DISABLE ROW LEVEL SECURITY;

