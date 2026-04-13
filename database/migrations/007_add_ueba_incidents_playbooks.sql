-- Migration: Add UEBA, Case Management, and Playbooks support
-- Description: Add tables for user behavior analytics, incident management, and automated playbooks

-- UEBA Baselines table
CREATE TABLE IF NOT EXISTS maes.ueba_baselines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES maes.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    baseline_data JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_ueba_baselines_user_org ON maes.ueba_baselines(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_ueba_baselines_active ON maes.ueba_baselines(organization_id) WHERE is_active = true;

-- Incidents table (for case management)
CREATE TABLE IF NOT EXISTS maes.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'contained', 'resolved', 'closed')),
    assigned_to UUID REFERENCES maes.users(id),
    source VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_org ON maes.incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON maes.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON maes.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON maes.incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON maes.incidents(created_at DESC);

-- Add incident_id to alerts table
ALTER TABLE maes.alerts ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES maes.incidents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_incident ON maes.alerts(incident_id);

-- Incident Timeline table
CREATE TABLE IF NOT EXISTS maes.incident_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES maes.incidents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    user_id UUID REFERENCES maes.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON maes.incident_timeline(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_created ON maes.incident_timeline(incident_id, created_at);

-- Incident Evidence table
CREATE TABLE IF NOT EXISTS maes.incident_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES maes.incidents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hash VARCHAR(128),
    storage_path VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    chain_of_custody JSONB DEFAULT '[]',
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_evidence_incident ON maes.incident_evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_evidence_type ON maes.incident_evidence(type);

-- Playbook Executions table
CREATE TABLE IF NOT EXISTS maes.playbook_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id VARCHAR(100) NOT NULL,
    playbook_name VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'pending_approval', 'error')),
    current_step VARCHAR(100),
    steps JSONB DEFAULT '[]',
    context JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playbook_executions_playbook ON maes.playbook_executions(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_status ON maes.playbook_executions(status);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_started ON maes.playbook_executions(started_at DESC);

-- Add comments
COMMENT ON TABLE maes.ueba_baselines IS 'User behavior baselines for anomaly detection';
COMMENT ON TABLE maes.incidents IS 'Security incidents for case management';
COMMENT ON TABLE maes.incident_timeline IS 'Timeline of events for incident investigation';
COMMENT ON TABLE maes.incident_evidence IS 'Evidence collected during incident response';
COMMENT ON TABLE maes.playbook_executions IS 'Automated playbook execution tracking';

-- Insert migration record
INSERT INTO maes.migrations (id, name, applied_at) 
VALUES (7, '007_add_ueba_incidents_playbooks.sql', NOW())
ON CONFLICT (id) DO NOTHING;
