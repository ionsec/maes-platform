-- Migration: Add canManageCompliance permission to appropriate users
-- Date: 2025-08-13
-- Description: Adds compliance management permission for report generation and download
--
-- This migration referenced role names that do not exist when it runs. At this
-- point the enum is still init.sql's ('admin', 'analyst', 'viewer') — the
-- legacy MSSP roles were already gone and 'super_admin' is not introduced until
-- 012_simplify_rbac_roles.sql. The first statement therefore failed with
--   invalid input value for enum user_role: "super_admin"
-- and, because the migration runner does not set ON_ERROR_STOP, the failure was
-- swallowed and the entire migration silently did nothing.
--
-- It now grants only to roles that actually exist in the enum at run time, so
-- it works whether it runs before or after the role simplification.

SET search_path TO maes, public;

DO $$
DECLARE
    target_role TEXT;
    granted_roles TEXT[] := ARRAY[
        'super_admin', 'admin', 'analyst',
        -- Legacy roles, retained so this still does the right thing on an
        -- installation that predates 012_simplify_rbac_roles.sql.
        'mssp_admin', 'mssp_analyst', 'client_admin', 'client_analyst',
        'standalone_admin', 'standalone_analyst'
    ];
    denied_roles TEXT[] := ARRAY[
        'viewer', 'mssp_responder', 'client_viewer', 'standalone_viewer'
    ];
    granted_count INTEGER := 0;
    denied_count INTEGER := 0;
BEGIN
    FOREACH target_role IN ARRAY granted_roles LOOP
        IF EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'user_role' AND e.enumlabel = target_role
        ) THEN
            EXECUTE format(
                'UPDATE maes.users SET permissions = jsonb_set(
                     COALESCE(permissions, ''{}''::jsonb),
                     ''{canManageCompliance}'', ''true''::jsonb, true)
                  WHERE role::text = %L', target_role);
            GET DIAGNOSTICS granted_count = ROW_COUNT;
        END IF;
    END LOOP;

    FOREACH target_role IN ARRAY denied_roles LOOP
        IF EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'user_role' AND e.enumlabel = target_role
        ) THEN
            EXECUTE format(
                'UPDATE maes.users SET permissions = jsonb_set(
                     COALESCE(permissions, ''{}''::jsonb),
                     ''{canManageCompliance}'', ''false''::jsonb, true)
                  WHERE role::text = %L', target_role);
            GET DIAGNOSTICS denied_count = ROW_COUNT;
        END IF;
    END LOOP;

    RAISE NOTICE 'canManageCompliance applied (last grant affected % row(s), last deny affected % row(s))',
        granted_count, denied_count;
END $$;

INSERT INTO maes.migrations (filename)
VALUES ('010_add_compliance_permission.sql')
ON CONFLICT (filename) DO NOTHING;
