-- Add error_details column to analysis_jobs table
ALTER TABLE maes.analysis_jobs 
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Add comment for documentation
COMMENT ON COLUMN maes.analysis_jobs.error_details IS 'Detailed error information including stack traces';