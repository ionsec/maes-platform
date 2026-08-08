-- Add new Microsoft Graph extraction types to the extraction_type enum

-- Add new extraction types for Microsoft Graph functionality
-- IF NOT EXISTS: on a fresh install init.sql already defines these, and
-- without the guard this migration aborts before the COMMENT below.
ALTER TYPE maes.extraction_type ADD VALUE IF NOT EXISTS 'ual_graph';
ALTER TYPE maes.extraction_type ADD VALUE IF NOT EXISTS 'licenses';

-- Add comment for documentation
COMMENT ON TYPE maes.extraction_type IS 'Enumeration of supported extraction types including Microsoft Graph methods';