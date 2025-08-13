-- Migration: Load CIS Microsoft 365 v4.0.0 Controls
-- This migration loads the initial set of CIS compliance controls

-- Check if controls already exist to make this idempotent
DO $$
BEGIN
    -- Only insert if no CIS v4.0.0 controls exist
    IF NOT EXISTS (SELECT 1 FROM maes.compliance_controls WHERE assessment_type = 'cis_v400') THEN
        
        -- Section 1: Account and Authentication Controls
        INSERT INTO maes.compliance_controls (
            assessment_type, control_id, section, title, description, rationale, impact, 
            remediation, severity, weight, graph_api_endpoint, check_method, expected_result
        ) VALUES 
        (
            'cis_v400', '1.1.1', 'Account and Authentication',
            'Ensure that multi-factor authentication is enabled for all Global Administrators',
            'Multi-factor authentication (MFA) should be enabled for all Global Administrator accounts to provide an additional layer of security.',
            'Global Administrator accounts have the highest level of access in Microsoft 365. Enabling MFA significantly reduces the risk of account compromise even if credentials are stolen.',
            'May require users to use additional authentication methods, but greatly improves security posture.',
            'Enable MFA for all Global Administrator accounts through Azure AD security settings or Conditional Access policies.',
            'level1', 2.00, '/directoryRoles', 'Check MFA status for Global Admin role members',
            '{"mfaEnabled": true, "scope": "all_global_admins"}'
        ),
        (
            'cis_v400', '1.1.2', 'Account and Authentication',
            'Ensure admin accounts are separate from standard user accounts',
            'Administrative accounts should be dedicated accounts that are separate from standard user accounts to reduce the risk of privilege escalation.',
            'Using separate administrative accounts follows the principle of least privilege and reduces the attack surface.',
            'Requires administrators to maintain separate accounts for administrative tasks.',
            'Create dedicated administrative accounts that are separate from day-to-day user accounts.',
            'level1', 1.50, '/users', 'Manual review of admin account naming and separation',
            '{"adminAccountsSeparated": true}'
        ),
        (
            'cis_v400', '1.1.3', 'Account and Authentication',
            'Ensure that between two and four global admins are designated',
            'Organizations should designate between 2-4 global administrators to balance security and operational requirements.',
            'Having too few global admins creates operational risk, while too many increases security risk. 2-4 is the recommended range.',
            'May require adjusting the number of global administrator accounts.',
            'Review current global admin assignments and adjust to maintain 2-4 accounts.',
            'level1', 1.00, '/directoryRoles', 'Count Global Administrator role members',
            '{"minGlobalAdmins": 2, "maxGlobalAdmins": 4}'
        ),

        -- Section 1.2: Conditional Access
        (
            'cis_v400', '1.2.1', 'Account and Authentication',
            'Ensure that multi-factor authentication is enabled for all users',
            'Multi-factor authentication should be enforced for all users through Conditional Access policies.',
            'MFA provides an essential security layer for user authentication and should be applied organization-wide.',
            'Users will need to configure and use MFA methods for authentication.',
            'Create Conditional Access policies that require MFA for all users.',
            'level1', 2.00, '/policies/conditionalAccessPolicies', 'Check Conditional Access policies for MFA requirements',
            '{"mfaEnabled": true, "scope": "all_users"}'
        ),
        (
            'cis_v400', '1.2.2', 'Account and Authentication',
            'Ensure that Conditional Access policies are configured to block legacy authentication',
            'Legacy authentication protocols should be blocked through Conditional Access policies.',
            'Legacy authentication bypasses modern security features like MFA and increases vulnerability to attacks.',
            'Some older applications may stop working if they rely on legacy authentication.',
            'Configure Conditional Access policies to block legacy authentication protocols.',
            'level1', 1.50, '/policies/conditionalAccessPolicies', 'Check for policies blocking legacy authentication',
            '{"legacyAuthBlocked": true}'
        ),

        -- Section 1.3: Privileged Identity Management
        (
            'cis_v400', '1.3.1', 'Account and Authentication',
            'Ensure that privileged identity management (PIM) is used for administrative roles',
            'Privileged Identity Management should be configured for all administrative role assignments.',
            'PIM provides just-in-time access and requires justification for privileged role activation, reducing standing privileges.',
            'Administrators will need to request and justify role activation.',
            'Enable and configure PIM for all administrative roles in Azure AD.',
            'level2', 1.50, '/privilegedAccess/aadRoles/resources', 'Check PIM configuration for admin roles',
            '{"pimEnabled": true, "scope": "admin_roles"}'
        ),

        -- Section 1.4: Identity Protection
        (
            'cis_v400', '1.4.1', 'Account and Authentication',
            'Ensure that sign-in risk policy is enabled and configured',
            'Azure AD Identity Protection sign-in risk policy should be configured to protect against risky sign-ins.',
            'Sign-in risk policies help detect and respond to suspicious authentication attempts automatically.',
            'May require users to perform MFA or be blocked when risk is detected.',
            'Enable and configure sign-in risk policy in Azure AD Identity Protection.',
            'level1', 1.50, '/riskDetections', 'Check sign-in risk policy configuration',
            '{"signInRiskPolicyEnabled": true}'
        ),
        (
            'cis_v400', '1.4.2', 'Account and Authentication',
            'Ensure that user risk policy is enabled and configured',
            'Azure AD Identity Protection user risk policy should be configured to protect against compromised users.',
            'User risk policies help identify and remediate potentially compromised user accounts.',
            'Users identified as risky may need to reset passwords or be blocked.',
            'Enable and configure user risk policy in Azure AD Identity Protection.',
            'level1', 1.50, '/riskyUsers', 'Check user risk policy configuration',
            '{"userRiskPolicyEnabled": true}'
        ),

        -- Section 3: Application Permissions
        (
            'cis_v400', '3.1.1', 'Application Permissions',
            'Ensure that OAuth application access restrictions are configured',
            'OAuth application consent should be restricted to prevent unauthorized applications from accessing organizational data.',
            'Unrestricted OAuth consent can lead to data exfiltration through malicious applications.',
            'Users may not be able to consent to applications without admin approval.',
            'Configure application consent policies to require admin consent for applications.',
            'level1', 1.50, '/applications', 'Check OAuth consent configuration',
            '{"oauthRestricted": true}'
        ),

        -- Section 6: Exchange Online
        (
            'cis_v400', '6.1.1', 'Exchange Online',
            'Ensure mail transport rules do not allow unrestricted mail flow',
            'Mail flow rules should be reviewed to ensure they do not bypass security controls.',
            'Overly permissive mail flow rules can bypass spam and malware filtering.',
            'Some legitimate mail flow scenarios may need to be reconfigured.',
            'Review and restrict mail transport rules in Exchange Online.',
            'level1', 1.00, '/transportRules', 'Review mail transport rules configuration',
            '{"restrictedMailFlow": true}'
        ),
        (
            'cis_v400', '6.1.2', 'Exchange Online',
            'Ensure that mailbox auditing is enabled for all users',
            'Mailbox auditing should be enabled by default for all mailboxes to track access and changes.',
            'Mailbox auditing provides crucial forensic data for investigating security incidents.',
            'Minimal impact, generates audit logs for mailbox activities.',
            'Enable mailbox auditing by default in Exchange Online.',
            'level1', 1.50, '/auditLogs', 'Check mailbox auditing configuration',
            '{"mailboxAuditingEnabled": true}'
        ),

        -- Section 8: Microsoft Teams
        (
            'cis_v400', '8.1.1', 'Microsoft Teams',
            'Ensure external user access is restricted',
            'External access in Microsoft Teams should be configured to prevent unauthorized collaboration.',
            'Unrestricted external access can lead to data leakage and unauthorized information sharing.',
            'May limit collaboration with external partners if too restrictive.',
            'Configure Teams external access settings to allow only trusted domains.',
            'level1', 1.00, '/teams/settings', 'Check Teams external access configuration',
            '{"externalAccessRestricted": true}'
        ),

        -- Section 9: OneDrive and SharePoint
        (
            'cis_v400', '9.1.1', 'OneDrive and SharePoint',
            'Ensure that external sharing is restricted',
            'External sharing in OneDrive and SharePoint should be limited to prevent data leakage.',
            'Unrestricted external sharing can lead to sensitive data being shared outside the organization.',
            'May impact collaboration with external partners.',
            'Configure sharing policies to restrict external sharing to specific domains or disable it.',
            'level1', 1.50, '/sites', 'Check SharePoint external sharing configuration',
            '{"externalSharingRestricted": true}'
        ),

        -- Section 10: Security and Compliance
        (
            'cis_v400', '10.1.1', 'Security and Compliance',
            'Ensure that Microsoft 365 audit log search is enabled',
            'Unified audit logging should be enabled to track all activities across Microsoft 365 services.',
            'Audit logs are essential for security monitoring, compliance, and incident investigation.',
            'No significant impact, generates logs for all activities.',
            'Enable unified audit logging in the Microsoft 365 compliance center.',
            'level1', 2.00, '/auditLogs', 'Check unified audit log configuration',
            '{"auditLogEnabled": true}'
        ),
        (
            'cis_v400', '10.1.2', 'Security and Compliance',
            'Ensure that retention policies are configured',
            'Data retention policies should be configured to meet compliance and legal requirements.',
            'Proper retention policies ensure data is kept for compliance but deleted when no longer needed.',
            'May impact storage and data availability based on retention settings.',
            'Configure retention policies in the Microsoft 365 compliance center.',
            'level1', 1.00, '/retentionPolicies', 'Check retention policy configuration',
            '{"retentionPoliciesConfigured": true}'
        );

        RAISE NOTICE 'Successfully loaded 15 CIS v4.0.0 compliance controls';
    ELSE
        RAISE NOTICE 'CIS v4.0.0 controls already exist, skipping insertion';
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_compliance_controls_type_active 
ON maes.compliance_controls(assessment_type, is_active) 
WHERE is_active = true;

-- Analyze the table for query optimization
ANALYZE maes.compliance_controls;

-- Record this migration
INSERT INTO maes.migrations (filename) 
VALUES ('007_load_cis_v400_controls.sql')
ON CONFLICT (filename) DO NOTHING;