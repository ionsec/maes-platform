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
    USING role::text::maes.user_role;

-- Drop old enum type
DROP TYPE maes.user_role_old;

-- Update any existing 'admin' roles to 'standalone_admin'
UPDATE maes.users SET role = 'standalone_admin' WHERE role = 'admin';
UPDATE maes.users SET role = 'standalone_analyst' WHERE role = 'analyst';  
UPDATE maes.users SET role = 'standalone_viewer' WHERE role = 'viewer';