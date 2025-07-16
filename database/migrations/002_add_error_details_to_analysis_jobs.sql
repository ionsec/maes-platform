-- Add missing error_details column to analysis_jobs table
-- This column is required by the analyzer service for proper error handling

ALTER TABLE maes.analysis_jobs ADD COLUMN IF NOT EXISTS error_details JSONB DEFAULT '{}';

-- Create index for better performance on error_details queries
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_error_details ON maes.analysis_jobs USING GIN (error_details);

-- Add comment for documentation
COMMENT ON COLUMN maes.analysis_jobs.error_details IS 'JSON object containing detailed error information for failed analysis jobs';