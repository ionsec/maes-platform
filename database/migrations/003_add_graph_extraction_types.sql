-- Add new Microsoft Graph extraction types to the extraction_type enum

-- Add new extraction types for Microsoft Graph functionality
ALTER TYPE maes.extraction_type ADD VALUE 'ual_graph';
ALTER TYPE maes.extraction_type ADD VALUE 'licenses';

-- Add comment for documentation
COMMENT ON TYPE maes.extraction_type IS 'Enumeration of supported extraction types including Microsoft Graph methods';