-- Migration: Add Microsoft 365 CIS compliance assessment support
-- Description: Add tables and enums to support CIS compliance assessment with historical tracking

-- Add compliance-related enum types
DO $$
BEGIN
    -- Assessment type enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_type') THEN
        CREATE TYPE maes.assessment_type AS ENUM (
            'cis_v400',
            'cis_v300', 
            'custom',
            'orca_style'
        );
    END IF;

    -- Control severity enum (CIS Level 1 vs Level 2)
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'control_severity') THEN
        CREATE TYPE maes.control_severity AS ENUM (
            'level1',
            'level2'
        );
    END IF;

    -- Compliance status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_status') THEN
        CREATE TYPE maes.compliance_status AS ENUM (
            'compliant',
            'non_compliant',
            'manual_review',
            'not_applicable',
            'error'
        );
    END IF;

    -- Schedule frequency enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_frequency') THEN
        CREATE TYPE maes.schedule_frequency AS ENUM (
            'daily',
            'weekly',
            'monthly',
            'quarterly'
        );
    END IF;
END $$;

-- Create compliance assessments table
CREATE TABLE IF NOT EXISTS maes.compliance_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    assessment_type maes.assessment_type NOT NULL DEFAULT 'cis_v400',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status maes.job_status NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_controls INTEGER DEFAULT 0,
    compliant_controls INTEGER DEFAULT 0,
    non_compliant_controls INTEGER DEFAULT 0,
    manual_review_controls INTEGER DEFAULT 0,
    not_applicable_controls INTEGER DEFAULT 0,
    error_controls INTEGER DEFAULT 0,
    compliance_score DECIMAL(5,2) DEFAULT 0.00 CHECK (compliance_score >= 0 AND compliance_score <= 100),
    weighted_score DECIMAL(5,2) DEFAULT 0.00 CHECK (weighted_score >= 0 AND weighted_score <= 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- in seconds
    error_message TEXT,
    error_details JSONB,
    metadata JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '{}',
    triggered_by UUID REFERENCES maes.users(id),
    is_scheduled BOOLEAN DEFAULT false,
    is_baseline BOOLEAN DEFAULT false,
    parent_schedule_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create compliance controls table (control definitions)
CREATE TABLE IF NOT EXISTS maes.compliance_controls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_type maes.assessment_type NOT NULL DEFAULT 'cis_v400',
    control_id VARCHAR(50) NOT NULL, -- e.g., "1.1.1", "3.2.1"
    section VARCHAR(100) NOT NULL, -- e.g., "Account and Authentication"
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    rationale TEXT,
    impact TEXT,
    remediation TEXT,
    severity maes.control_severity NOT NULL DEFAULT 'level1',
    weight DECIMAL(3,2) DEFAULT 1.00 CHECK (weight > 0),
    graph_api_endpoint TEXT,
    check_method TEXT, -- Description of how the control is checked
    expected_result JSONB, -- Expected configuration for compliance
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assessment_type, control_id)
);

-- Create compliance results table (individual control results)
CREATE TABLE IF NOT EXISTS maes.compliance_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES maes.compliance_assessments(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES maes.compliance_controls(id) ON DELETE CASCADE,
    status maes.compliance_status NOT NULL,
    score DECIMAL(5,2) DEFAULT 0.00 CHECK (score >= 0 AND score <= 100),
    actual_result JSONB,
    expected_result JSONB,
    evidence JSONB, -- API response data used for evaluation
    remediation_guidance TEXT,
    error_message TEXT,
    error_details JSONB,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create compliance schedules table
CREATE TABLE IF NOT EXISTS maes.compliance_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    assessment_type maes.assessment_type NOT NULL DEFAULT 'cis_v400',
    frequency maes.schedule_frequency NOT NULL,
    is_active BOOLEAN DEFAULT true,
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_assessment_id UUID REFERENCES maes.compliance_assessments(id),
    parameters JSONB DEFAULT '{}',
    created_by UUID REFERENCES maes.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_assessments_org_id 
ON maes.compliance_assessments(organization_id);

CREATE INDEX IF NOT EXISTS idx_compliance_assessments_status 
ON maes.compliance_assessments(status);

CREATE INDEX IF NOT EXISTS idx_compliance_assessments_created_at 
ON maes.compliance_assessments(created_at);

CREATE INDEX IF NOT EXISTS idx_compliance_assessments_baseline 
ON maes.compliance_assessments(organization_id, is_baseline) 
WHERE is_baseline = true;

CREATE INDEX IF NOT EXISTS idx_compliance_results_assessment_id 
ON maes.compliance_results(assessment_id);

CREATE INDEX IF NOT EXISTS idx_compliance_results_control_id 
ON maes.compliance_results(control_id);

CREATE INDEX IF NOT EXISTS idx_compliance_results_status 
ON maes.compliance_results(status);

CREATE INDEX IF NOT EXISTS idx_compliance_controls_assessment_type 
ON maes.compliance_controls(assessment_type);

CREATE INDEX IF NOT EXISTS idx_compliance_controls_active 
ON maes.compliance_controls(is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_compliance_schedules_org_id 
ON maes.compliance_schedules(organization_id);

CREATE INDEX IF NOT EXISTS idx_compliance_schedules_next_run 
ON maes.compliance_schedules(next_run_at) 
WHERE is_active = true;

-- Add compliance permissions to existing permissions enum if not exists
-- This will be handled in the application layer for now

-- Insert migration record
INSERT INTO maes.migrations (id, name, applied_at) 
VALUES (6, '006_add_compliance_assessment.sql', NOW())
ON CONFLICT (id) DO NOTHING;