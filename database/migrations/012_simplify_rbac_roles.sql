-- Migration: Simplify RBAC roles to a cleaner system
-- This removes the complex MSSP/client/standalone role structure in favor of a simpler model

-- First, backup existing user roles for rollback if needed
CREATE TABLE IF NOT EXISTS maes.role_migration_backup AS 
SELECT id, email, role, created_at FROM maes.users;

-- Create new simplified role enum
ALTER TYPE maes.user_role RENAME TO user_role_legacy;

CREATE TYPE maes.user_role AS ENUM (
  'super_admin',  -- Full system access, can manage all organizations
  'admin',        -- Organization admin, full access within their org
  'analyst',      -- Can run extractions and analysis, manage alerts
  'viewer'        -- Read-only access to reports and dashboards
);

-- Migrate existing users to simplified roles
ALTER TABLE maes.users 
  ALTER COLUMN role TYPE maes.user_role 
  USING CASE
    WHEN role::text = 'super_admin' THEN 'super_admin'::maes.user_role
    WHEN role::text IN ('mssp_admin', 'client_admin', 'standalone_admin', 'admin') THEN 'admin'::maes.user_role
    WHEN role::text IN ('mssp_analyst', 'mssp_responder', 'client_analyst', 'standalone_analyst', 'analyst') THEN 'analyst'::maes.user_role
    WHEN role::text IN ('client_viewer', 'standalone_viewer', 'viewer') THEN 'viewer'::maes.user_role
    ELSE 'viewer'::maes.user_role
  END;

-- Drop the legacy role type
DROP TYPE maes.user_role_legacy;

-- Add comment for documentation
COMMENT ON TYPE maes.user_role IS 'Simplified RBAC roles: super_admin (system), admin (org), analyst (operations), viewer (read-only)';

-- Log the migration
INSERT INTO maes.system_logs (level, message, created_at)
VALUES ('info', 'RBAC roles simplified from MSSP/client/standalone to super_admin/admin/analyst/viewer', NOW());