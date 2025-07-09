-- Add FQDN column to organizations table
ALTER TABLE maes.organizations 
ADD COLUMN IF NOT EXISTS fqdn VARCHAR(255);

-- Add index for FQDN lookups
CREATE INDEX IF NOT EXISTS idx_organizations_fqdn ON maes.organizations(fqdn);

-- Update existing organizations to set FQDN from tenant_id if it looks like a domain
UPDATE maes.organizations 
SET fqdn = tenant_id 
WHERE tenant_id LIKE '%.%' AND fqdn IS NULL;