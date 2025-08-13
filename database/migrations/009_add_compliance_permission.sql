-- Migration: Add canManageCompliance permission to appropriate users
-- Date: 2025-08-13
-- Description: Adds compliance management permission for report generation and download

-- Set search path
SET search_path TO maes, public;

-- Update super_admin users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'super_admin';

-- Update mssp_admin users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'mssp_admin';

-- Update mssp_analyst users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'mssp_analyst';

-- Update client_admin users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'client_admin';

-- Update client_analyst users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'client_analyst';

-- Update standalone_admin users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'standalone_admin';

-- Update standalone_analyst users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'standalone_analyst';

-- Update admin users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'admin';

-- Update analyst users
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'analyst';

-- Set false for viewer roles
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'false'::jsonb,
    true
)
WHERE role IN ('mssp_responder', 'client_viewer', 'standalone_viewer', 'viewer');

-- Log the changes
DO $$
DECLARE
    granted_count INTEGER;
    denied_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO granted_count
    FROM users 
    WHERE role IN ('super_admin', 'mssp_admin', 'mssp_analyst', 'client_admin', 'client_analyst', 
                   'standalone_admin', 'standalone_analyst', 'admin', 'analyst')
      AND permissions->>'canManageCompliance' = 'true';
    
    SELECT COUNT(*) INTO denied_count
    FROM users 
    WHERE role IN ('mssp_responder', 'client_viewer', 'standalone_viewer', 'viewer')
      AND permissions->>'canManageCompliance' = 'false';
    
    RAISE NOTICE 'Granted canManageCompliance permission to % users', granted_count;
    RAISE NOTICE 'Denied canManageCompliance permission to % users', denied_count;
END $$;

-- Verify the update
SELECT 
    email, 
    role, 
    permissions->>'canManageCompliance' as can_manage_compliance
FROM users 
ORDER BY role, email;