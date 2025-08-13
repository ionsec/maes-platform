-- Create compliance_reports table for storing generated report metadata
CREATE TABLE IF NOT EXISTS maes.compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES maes.compliance_assessments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
  format VARCHAR(20) NOT NULL CHECK (format IN ('html', 'json', 'csv', 'pdf', 'xlsx')),
  type VARCHAR(50) NOT NULL DEFAULT 'full',
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  status VARCHAR(50) DEFAULT 'completed',
  generated_by UUID REFERENCES maes.users(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for better query performance
  CONSTRAINT idx_compliance_reports_assessment FOREIGN KEY (assessment_id) 
    REFERENCES maes.compliance_assessments(id) ON DELETE CASCADE,
  CONSTRAINT idx_compliance_reports_organization FOREIGN KEY (organization_id) 
    REFERENCES maes.organizations(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_compliance_reports_assessment_id ON maes.compliance_reports(assessment_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_organization_id ON maes.compliance_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_created_at ON maes.compliance_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_file_name ON maes.compliance_reports(file_name);

-- Add comment
COMMENT ON TABLE maes.compliance_reports IS 'Stores metadata for generated compliance assessment reports';