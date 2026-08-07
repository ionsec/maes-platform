-- Migration: Add SIEM configurations table
-- Description: Persist SIEM integration configs. Previously held only in memory
-- and lost on restart, with mock test/export behavior.

CREATE TABLE IF NOT EXISTS maes.siem_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    endpoint TEXT NOT NULL,
    api_key TEXT,
    format VARCHAR(20) NOT NULL DEFAULT 'json',
    enabled BOOLEAN NOT NULL DEFAULT true,
    export_frequency VARCHAR(20) NOT NULL DEFAULT 'manual',
    last_test_at TIMESTAMP WITH TIME ZONE,
    last_test_status VARCHAR(20),
    last_export_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_siem_configurations_org
    ON maes.siem_configurations(organization_id);
