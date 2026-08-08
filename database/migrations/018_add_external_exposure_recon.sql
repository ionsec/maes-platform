-- Migration: External exposure reconnaissance
-- Description: Adds the unauthenticated, domain-seeded attack-surface assessment.
--              Unlike compliance assessments, recon scans reach outside the tenant,
--              so this schema carries an explicit authorization record and a
--              complete audit trail of every outbound probe.

-- New assessment type, kept alongside the compliance types so reports and
-- scheduling can reason about both in one place.
ALTER TYPE maes.assessment_type ADD VALUE IF NOT EXISTS 'external_exposure';

DO $$
BEGIN
    -- Finding severity. Distinct from maes.control_severity (level1/level2),
    -- which describes CIS benchmark tiers rather than risk.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finding_severity') THEN
        CREATE TYPE maes.finding_severity AS ENUM (
            'critical',
            'high',
            'medium',
            'low',
            'info'
        );
    END IF;

    -- Scan aggressiveness. Each tier is a superset of the one before it.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recon_profile') THEN
        CREATE TYPE maes.recon_profile AS ENUM (
            'passive',
            'standard',
            'aggressive'
        );
    END IF;
END $$;

-- Recorded scope authorization. An aggressive scan is refused without a
-- non-expired row here whose domain list covers the seed domain.
CREATE TABLE IF NOT EXISTS maes.recon_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    domains TEXT[] NOT NULL,
    profile_ceiling maes.recon_profile NOT NULL DEFAULT 'standard',
    authorized_by UUID REFERENCES maes.users(id),
    authorized_by_name VARCHAR(255),
    authorization_reference VARCHAR(255), -- engagement/ticket reference
    notes TEXT,
    authorized_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recon_authorizations_domains_not_empty CHECK (array_length(domains, 1) > 0),
    CONSTRAINT recon_authorizations_expiry_after_grant CHECK (expires_at > authorized_at)
);

CREATE INDEX IF NOT EXISTS idx_recon_authorizations_org
    ON maes.recon_authorizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_recon_authorizations_active
    ON maes.recon_authorizations(organization_id, expires_at)
    WHERE revoked_at IS NULL;

-- One external exposure scan.
CREATE TABLE IF NOT EXISTS maes.recon_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    seed_domain VARCHAR(253) NOT NULL,
    profile maes.recon_profile NOT NULL DEFAULT 'passive',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status maes.job_status NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    authorization_id UUID REFERENCES maes.recon_authorizations(id),
    total_phases INTEGER DEFAULT 0,
    completed_phases INTEGER DEFAULT 0,
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    low_findings INTEGER DEFAULT 0,
    info_findings INTEGER DEFAULT 0,
    total_probes INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- seconds
    error_message TEXT,
    error_details JSONB,
    metadata JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '{}',
    triggered_by UUID REFERENCES maes.users(id),
    is_scheduled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_scans_org_created
    ON maes.recon_scans(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_scans_status
    ON maes.recon_scans(status);

-- Individual findings emitted by phases.
CREATE TABLE IF NOT EXISTS maes.recon_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES maes.recon_scans(id) ON DELETE CASCADE,
    finding_id VARCHAR(100) NOT NULL, -- stable catalog slug, e.g. FED-ADFS-MEX-EXPOSED
    phase VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity maes.finding_severity NOT NULL DEFAULT 'info',
    tags TEXT[] DEFAULT '{}',
    target VARCHAR(500), -- host, domain or URL the finding concerns
    evidence JSONB DEFAULT '{}',
    impact TEXT,
    remediation TEXT,
    mitre_technique VARCHAR(50),
    is_lead BOOLEAN DEFAULT false, -- an analyst action rather than a confirmed finding
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_findings_scan
    ON maes.recon_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_recon_findings_severity
    ON maes.recon_findings(scan_id, severity);
CREATE INDEX IF NOT EXISTS idx_recon_findings_finding_id
    ON maes.recon_findings(finding_id);
CREATE INDEX IF NOT EXISTS idx_recon_findings_tags
    ON maes.recon_findings USING GIN(tags);

-- Attack chains assembled from the tags carried by findings.
CREATE TABLE IF NOT EXISTS maes.recon_attack_paths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES maes.recon_scans(id) ON DELETE CASCADE,
    path_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    effort VARCHAR(20), -- low | medium | high
    blast_radius VARCHAR(255),
    severity maes.finding_severity NOT NULL DEFAULT 'high',
    trigger_tags TEXT[] DEFAULT '{}',
    matched_findings UUID[] DEFAULT '{}',
    narrative TEXT,
    mitre_techniques TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_attack_paths_scan
    ON maes.recon_attack_paths(scan_id);

-- Audit trail of every outbound probe. Written for all profiles, not only
-- aggressive ones: a tool that touches infrastructure must be able to account
-- for exactly what it sent.
CREATE TABLE IF NOT EXISTS maes.recon_probe_log (
    id BIGSERIAL PRIMARY KEY,
    scan_id UUID NOT NULL REFERENCES maes.recon_scans(id) ON DELETE CASCADE,
    phase VARCHAR(100),
    kind VARCHAR(20) NOT NULL DEFAULT 'http', -- http | dns
    method VARCHAR(10),
    url TEXT NOT NULL,
    host VARCHAR(253),
    status_code INTEGER,
    elapsed_ms INTEGER,
    error TEXT,
    user_agent TEXT,
    probed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_probe_log_scan
    ON maes.recon_probe_log(scan_id, probed_at);
CREATE INDEX IF NOT EXISTS idx_recon_probe_log_host
    ON maes.recon_probe_log(scan_id, host);

-- Reuse the existing updated_at trigger function from the initial schema.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_recon_scans_updated_at') THEN
        CREATE TRIGGER update_recon_scans_updated_at
            BEFORE UPDATE ON maes.recon_scans
            FOR EACH ROW EXECUTE FUNCTION maes.update_updated_at_column();
    END IF;
END $$;
