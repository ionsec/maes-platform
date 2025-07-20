-- Migration to support users having access to multiple organizations
-- This enables the MSSP model where users can manage multiple client organizations

-- Create user_organizations junction table
CREATE TABLE IF NOT EXISTS maes.user_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES maes.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES maes.organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    permissions JSONB DEFAULT '{}',
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, organization_id)
);

-- Add current_organization_id to users table for active organization context
ALTER TABLE maes.users ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES maes.organizations(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id ON maes.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id ON maes.user_organizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_primary ON maes.user_organizations(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_users_current_organization ON maes.users(current_organization_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_organizations_updated_at 
    BEFORE UPDATE ON maes.user_organizations
    FOR EACH ROW EXECUTE FUNCTION maes.update_updated_at_column();

-- Function to get user accessible organizations
CREATE OR REPLACE FUNCTION maes.get_user_accessible_organizations(p_user_id UUID)
RETURNS UUID[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT uo.organization_id 
        FROM maes.user_organizations uo 
        WHERE uo.user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has access to organization
CREATE OR REPLACE FUNCTION maes.user_has_organization_access(p_user_id UUID, p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 
        FROM maes.user_organizations uo 
        WHERE uo.user_id = p_user_id 
        AND uo.organization_id = p_organization_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user's primary organization
CREATE OR REPLACE FUNCTION maes.get_user_primary_organization(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    primary_org_id UUID;
BEGIN
    SELECT uo.organization_id INTO primary_org_id
    FROM maes.user_organizations uo 
    WHERE uo.user_id = p_user_id 
    AND uo.is_primary = true;
    
    -- If no primary organization, return the first one
    IF primary_org_id IS NULL THEN
        SELECT uo.organization_id INTO primary_org_id
        FROM maes.user_organizations uo 
        WHERE uo.user_id = p_user_id 
        ORDER BY uo.created_at ASC
        LIMIT 1;
    END IF;
    
    RETURN primary_org_id;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing users to the new structure
-- For existing users, create user_organization entries based on their current organization_id
INSERT INTO maes.user_organizations (user_id, organization_id, role, is_primary, permissions)
SELECT 
    u.id, 
    u.organization_id, 
    u.role::text,
    true, -- Set as primary organization
    u.permissions
FROM maes.users u 
WHERE u.organization_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM maes.user_organizations uo 
    WHERE uo.user_id = u.id AND uo.organization_id = u.organization_id
);

-- Update current_organization_id to match their primary organization
UPDATE maes.users 
SET current_organization_id = organization_id 
WHERE current_organization_id IS NULL 
AND organization_id IS NOT NULL;

-- Grant permissions
GRANT ALL PRIVILEGES ON maes.user_organizations TO maes_user;