-- Migration: Add organization offboarding support
-- Description: Add columns to support organization offboarding with grace periods

-- Add offboarding columns to organizations table
DO $$
BEGIN
    -- Add offboard_scheduled_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'maes' 
        AND table_name = 'organizations' 
        AND column_name = 'offboard_scheduled_at'
    ) THEN
        ALTER TABLE maes.organizations ADD COLUMN offboard_scheduled_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add offboard_reason column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'maes' 
        AND table_name = 'organizations' 
        AND column_name = 'offboard_reason'
    ) THEN
        ALTER TABLE maes.organizations ADD COLUMN offboard_reason TEXT;
    END IF;

    -- Add offboard_grace_period_days column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'maes' 
        AND table_name = 'organizations' 
        AND column_name = 'offboard_grace_period_days'
    ) THEN
        ALTER TABLE maes.organizations ADD COLUMN offboard_grace_period_days INTEGER;
    END IF;
END $$;

-- Create index for scheduled offboarding queries
CREATE INDEX IF NOT EXISTS idx_organizations_offboard_scheduled 
ON maes.organizations(offboard_scheduled_at) 
WHERE offboard_scheduled_at IS NOT NULL;

-- Insert migration record
INSERT INTO maes.migrations (id, name, applied_at) 
VALUES (5, '005_add_organization_offboarding.sql', NOW())
ON CONFLICT (id) DO NOTHING;