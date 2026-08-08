-- Migration: External exposure report metadata
-- Description: Recon reports cannot live in maes.compliance_reports, whose
--              assessment_id is a NOT NULL foreign key to compliance_assessments.
--              This mirrors that table for scans.

CREATE TABLE IF NOT EXISTS maes.recon_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES maes.recon_scans(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    format VARCHAR(10) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'full',
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    -- Whether the probe audit trail was included, so a report handed to a third
    -- party can be told apart from an internal one at a glance.
    includes_probe_log BOOLEAN DEFAULT false,
    generated_by UUID REFERENCES maes.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_reports_scan_id ON maes.recon_reports(scan_id);
CREATE INDEX IF NOT EXISTS idx_recon_reports_organization_id ON maes.recon_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_recon_reports_created_at ON maes.recon_reports(created_at DESC);
