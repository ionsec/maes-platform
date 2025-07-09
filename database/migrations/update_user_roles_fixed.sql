-- First, remove the default constraint
ALTER TABLE maes.users ALTER COLUMN role DROP DEFAULT;

-- Update user_role enum to include all role types
ALTER TYPE maes.user_role RENAME TO user_role_old;

CREATE TYPE maes.user_role AS ENUM (
    'super_admin',
    'mssp_admin',
    'mssp_analyst', 
    'mssp_responder',
    'client_admin',
    'client_analyst',
    'client_viewer',
    'standalone_admin',
    'standalone_analyst',
    'standalone_viewer',
    'admin',
    'analyst',
    'viewer'
);

-- Update existing columns to use new enum
ALTER TABLE maes.users 
    ALTER COLUMN role TYPE maes.user_role 
    USING 
        CASE role::text
            WHEN 'admin' THEN 'standalone_admin'::maes.user_role
            WHEN 'analyst' THEN 'standalone_analyst'::maes.user_role
            WHEN 'viewer' THEN 'standalone_viewer'::maes.user_role
            ELSE role::text::maes.user_role
        END;

-- Set new default
ALTER TABLE maes.users ALTER COLUMN role SET DEFAULT 'standalone_analyst';

-- Drop old enum type
DROP TYPE maes.user_role_old;