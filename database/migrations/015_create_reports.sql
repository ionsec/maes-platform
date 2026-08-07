-- Migration: Create reports table
-- Description: Store generated report metadata and artifact paths. The previous
-- reports module referenced a Report model that did not exist; this provides the
-- backing table for a functional reports workflow.

CREATE TABLE IF NOT EXISTS maes.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES maes.users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL DEFAULT 'html',
    parameters JSONB NOT NULL DEFAULT '{}',
    schedule JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    file_path TEXT,
    file_name TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_org_created
    ON maes.reports(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_org_status
    ON maes.reports(organization_id, status);
