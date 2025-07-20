-- Migration: Add canManageSystemSettings permission to admin users
-- Date: 2025-07-20
-- Description: Ensures admin users can access system logs by adding the missing permission

-- Set search path
SET search_path TO maes, public;

-- Update existing admin users to have canManageSystemSettings permission
UPDATE users 
SET permissions = permissions || '{"canManageSystemSettings": true}'
WHERE role = 'admin' 
  AND (permissions->>'canManageSystemSettings' IS NULL 
       OR permissions->>'canManageSystemSettings' = 'false');

-- Log the changes
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % admin users with canManageSystemSettings permission', updated_count;
END $$;

-- Verify the update
SELECT 
    email, 
    role, 
    permissions->>'canManageSystemSettings' as can_manage_system_settings
FROM users 
WHERE role = 'admin';