-- Migration: Add canManageCompliance permission to appropriate users
-- Date: 2025-08-13
-- Description: Adds compliance management permission for report generation and download

-- Set search path
SET search_path TO maes, public;

-- Update admin users to have canManageCompliance permission
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'admin';

-- Update analyst users to have canManageCompliance permission
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'true'::jsonb,
    true
)
WHERE role = 'analyst';

-- Update viewer users to NOT have canManageCompliance permission (view only)
UPDATE users 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{canManageCompliance}',
    'false'::jsonb,
    true
)
WHERE role = 'viewer';

-- Log the changes
DO $$
DECLARE
    admin_count INTEGER;
    analyst_count INTEGER;
    viewer_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    SELECT COUNT(*) INTO analyst_count FROM users WHERE role = 'analyst';
    SELECT COUNT(*) INTO viewer_count FROM users WHERE role = 'viewer';
    
    RAISE NOTICE 'Updated % admin users with canManageCompliance = true', admin_count;
    RAISE NOTICE 'Updated % analyst users with canManageCompliance = true', analyst_count;
    RAISE NOTICE 'Updated % viewer users with canManageCompliance = false', viewer_count;
END $$;

-- Verify the update
SELECT 
    email, 
    role, 
    permissions->>'canManageCompliance' as can_manage_compliance
FROM users 
ORDER BY role, email;