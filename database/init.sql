-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create initial database schema
CREATE SCHEMA IF NOT EXISTS maes;

-- Set search path
SET search_path TO maes, public;

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'analyst', 'viewer');
CREATE TYPE extraction_type AS ENUM (
    'unified_audit_log',
    'azure_signin_logs', 
    'azure_audit_logs',
    'mailbox_audit',
    'message_trace',
    'emails',
    'oauth_permissions',
    'mfa_status',
    'risky_users',
    'risky_detections',
    'devices',
    'full_extraction'
);
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE alert_status AS ENUM ('new', 'acknowledged', 'investigating', 'resolved', 'false_positive');

-- Create tables
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    fqdn VARCHAR(255),
    subscription_id VARCHAR(255),
    organization_type VARCHAR(50) DEFAULT 'standalone' CHECK (organization_type IN ('mssp', 'client', 'standalone')),
    subscription_status VARCHAR(50) DEFAULT 'active',
    service_tier VARCHAR(50) DEFAULT 'standard',
    settings JSONB DEFAULT '{}',
    credentials JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    offboard_scheduled_at TIMESTAMP WITH TIME ZONE,
    offboard_reason TEXT,
    offboard_grace_period_days INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role DEFAULT 'analyst',
    permissions JSONB DEFAULT '{}',
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extractions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    type extraction_type NOT NULL,
    status job_status DEFAULT 'pending',
    priority priority_level DEFAULT 'medium',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    items_extracted INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER,
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    parameters JSONB DEFAULT '{}',
    output_files JSONB DEFAULT '[]',
    statistics JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    triggered_by UUID REFERENCES users(id),
    is_scheduled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    status job_status DEFAULT 'pending',
    priority priority_level DEFAULT 'medium',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER,
    error_message TEXT,
    parameters JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    alerts JSONB DEFAULT '[]',
    output_files JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    severity alert_severity NOT NULL,
    type VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'other',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status alert_status DEFAULT 'new',
    source JSONB DEFAULT '{}',
    affected_entities JSONB DEFAULT '{}',
    evidence JSONB DEFAULT '{}',
    mitre_attack JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id),
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    format VARCHAR(10) DEFAULT 'pdf',
    status job_status DEFAULT 'pending',
    schedule JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '{}',
    sections JSONB DEFAULT '[]',
    file_path VARCHAR(500),
    file_size BIGINT,
    generated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    recipients JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    resource VARCHAR(255),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path VARCHAR(500),
    status_code INTEGER,
    duration INTEGER,
    details JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_organizations_tenant_id ON organizations(tenant_id);
CREATE INDEX idx_organizations_fqdn ON organizations(fqdn);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_extractions_organization_id ON extractions(organization_id);
CREATE INDEX idx_extractions_status ON extractions(status);
CREATE INDEX idx_extractions_type ON extractions(type);
CREATE INDEX idx_extractions_date_range ON extractions(start_date, end_date);
CREATE INDEX idx_extractions_created_at ON extractions(created_at);

CREATE INDEX idx_analysis_jobs_extraction_id ON analysis_jobs(extraction_id);
CREATE INDEX idx_analysis_jobs_organization_id ON analysis_jobs(organization_id);
CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX idx_analysis_jobs_type ON analysis_jobs(type);

CREATE INDEX idx_alerts_organization_id ON alerts(organization_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_category ON alerts(category);
CREATE INDEX idx_alerts_assigned_to ON alerts(assigned_to);

CREATE INDEX idx_reports_organization_id ON reports(organization_id);
CREATE INDEX idx_reports_created_by ON reports(created_by);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_status ON reports(status);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_category ON audit_logs(category);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create hypertables for time-series data (commented out due to primary key constraint)
-- SELECT create_hypertable('audit_logs', 'created_at', if_not_exists => TRUE);

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_extractions_updated_at BEFORE UPDATE ON extractions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_analysis_jobs_updated_at BEFORE UPDATE ON analysis_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123 - change in production!)
INSERT INTO organizations (id, name, tenant_id) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'MAES Default Organization', 'maes-default-tenant');

INSERT INTO users (organization_id, email, username, password, role, permissions) VALUES 
    ('00000000-0000-0000-0000-000000000001', 
     'admin@maes.local', 
     'admin', 
     '$2a$10$TVQSYBn13hZpQ9O/uXKsTu32UmErtxG3m2FHUDL7DOhBLwUS7l1fm', -- bcrypt hash of 'admin123'
     'admin',
     '{"canManageExtractions": true, "canRunAnalysis": true, "canViewReports": true, "canManageAlerts": true, "canManageUsers": true, "canManageOrganization": true, "canManageSystemSettings": true}');

-- Create migrations table for tracking applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_organizations table for multi-organization support (Migration 004)
CREATE TABLE IF NOT EXISTS user_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    permissions JSONB DEFAULT '{}',
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, organization_id)
);

-- Add current_organization_id to users table for active organization context
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES organizations(id);

-- Add indexes for user_organizations performance
CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id ON user_organizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_primary ON user_organizations(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_users_current_organization ON users(current_organization_id);

-- Create trigger for user_organizations updated_at
CREATE TRIGGER update_user_organizations_updated_at 
    BEFORE UPDATE ON user_organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create helper functions for multi-organization support
CREATE OR REPLACE FUNCTION get_user_accessible_organizations(p_user_id UUID)
RETURNS UUID[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT uo.organization_id 
        FROM user_organizations uo 
        WHERE uo.user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION user_has_organization_access(p_user_id UUID, p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 
        FROM user_organizations uo 
        WHERE uo.user_id = p_user_id 
        AND uo.organization_id = p_organization_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_primary_organization(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    primary_org_id UUID;
BEGIN
    SELECT uo.organization_id INTO primary_org_id
    FROM user_organizations uo 
    WHERE uo.user_id = p_user_id 
    AND uo.is_primary = true;
    
    -- If no primary organization, return the first one
    IF primary_org_id IS NULL THEN
        SELECT uo.organization_id INTO primary_org_id
        FROM user_organizations uo 
        WHERE uo.user_id = p_user_id 
        ORDER BY uo.created_at ASC
        LIMIT 1;
    END IF;
    
    RETURN primary_org_id;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing admin user to the new structure
INSERT INTO user_organizations (user_id, organization_id, role, is_primary, permissions)
SELECT 
    u.id, 
    u.organization_id, 
    u.role::text,
    true, -- Set as primary organization
    u.permissions
FROM users u 
WHERE u.organization_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM user_organizations uo 
    WHERE uo.user_id = u.id AND uo.organization_id = u.organization_id
);

-- Update current_organization_id to match their primary organization
UPDATE users 
SET current_organization_id = organization_id 
WHERE current_organization_id IS NULL 
AND organization_id IS NOT NULL;

-- Record applied migrations
INSERT INTO migrations (filename) VALUES 
    ('001_initial_schema.sql'),
    ('004_add_user_organization_support.sql')
ON CONFLICT (filename) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA maes TO maes_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA maes TO maes_user;
GRANT ALL PRIVILEGES ON SCHEMA maes TO maes_user;