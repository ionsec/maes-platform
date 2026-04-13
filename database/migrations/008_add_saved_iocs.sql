-- Migration: Add saved IOCs table for threat intelligence tracking
-- Description: Stores user-saved indicators of compromise for monitoring

CREATE TABLE IF NOT EXISTS maes.saved_iocs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    value VARCHAR(500) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ip', 'domain', 'hash')),
    risk_level VARCHAR(20),
    risk_score INTEGER,
    enrichment_data JSONB DEFAULT '{}',
    notes TEXT,
    last_enriched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, value)
);

CREATE INDEX IF NOT EXISTS idx_saved_iocs_org ON maes.saved_iocs(organization_id);
CREATE INDEX IF NOT EXISTS idx_saved_iocs_type ON maes.saved_iocs(type);
CREATE INDEX IF NOT EXISTS idx_saved_iocs_risk ON maes.saved_iocs(risk_level);
CREATE INDEX IF NOT EXISTS idx_saved_iocs_enriched ON maes.saved_iocs(last_enriched_at);

COMMENT ON TABLE maes.saved_iocs IS 'User-saved indicators of compromise for threat intelligence tracking';

-- Add canAccessThreatIntel permission to UEBA-related tables if needed
-- Ensure the permission exists in role system (handled by app logic)

INSERT INTO maes.migrations (id, name, applied_at) 
VALUES (8, '008_add_saved_iocs.sql', NOW())
ON CONFLICT (id) DO NOTHING;
