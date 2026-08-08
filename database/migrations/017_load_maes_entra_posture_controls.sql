-- Migration: Load MAES Entra ID Posture controls (maes_entra_v100)
-- Description: Adds an assessment type covering identity-exposure posture that the
--              CIS control set does not reach: federation/ADFS surface, legacy auth
--              and ROPC, MFA registration coverage, Conditional Access gaps,
--              service principal privilege, and mail/DNS authentication posture.

-- Add the new assessment type. Run outside a transaction so the value is
-- committed before the seed block below references it.
ALTER TYPE maes.assessment_type ADD VALUE IF NOT EXISTS 'maes_entra_v100';

-- Seed the control definitions (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM maes.compliance_controls WHERE assessment_type = 'maes_entra_v100') THEN

        INSERT INTO maes.compliance_controls (
            assessment_type, control_id, section, title, description, rationale, impact,
            remediation, severity, weight, graph_api_endpoint, check_method, expected_result
        ) VALUES

        -- Section: Federation
        (
            'maes_entra_v100', 'MAES-FED-01', 'Federation',
            'Ensure federated domains are inventoried and understood',
            'Identify which verified domains are federated to an external identity provider (typically AD FS) rather than managed directly by Entra ID.',
            'A federated domain moves authentication off Entra ID and onto infrastructure the tenant operates itself. Compromise of the federation server''s token-signing certificate allows an attacker to forge SAML assertions for any user in the domain (Golden SAML), bypassing MFA and Conditional Access entirely.',
            'Informational. Migrating federated domains to managed authentication (PHS or PTA with seamless SSO) removes this class of risk but requires a planned cutover.',
            'Review each federated domain and confirm the federation is still required. Where it is not, convert the domain to managed authentication. Where it is, ensure the AD FS estate is treated as tier-0 infrastructure.',
            'level1', 1.50, '/domains', 'Enumerate verified domains and report authenticationType per domain',
            '{"federatedDomains": 0}'
        ),
        (
            'maes_entra_v100', 'MAES-FED-02', 'Federation',
            'Ensure AD FS legacy WS-Trust endpoints are not publicly reachable',
            'The AD FS WS-Trust endpoints /adfs/services/trust/2005/usernamemixed and /adfs/services/trust/2005/windowstransport accept username and password directly and are commonly reachable from the internet.',
            'These endpoints support a non-interactive, password-only authentication path. Because the request never reaches Entra ID as an interactive sign-in, Conditional Access and Entra MFA are not applied, making the endpoints a standard target for password spraying against federated tenants.',
            'Disabling the endpoints breaks legacy clients and any tooling that authenticates with WS-Trust. Extranet access to windowstransport is rarely required.',
            'In the AD FS management console, disable the WS-Trust 1.3 and 2005 Windows transport and username-mixed endpoints for extranet access, or restrict them at the Web Application Proxy. Where MFA is required, enforce it at AD FS as well as at Entra ID.',
            'level2', 2.50, null, 'HTTP probe of the tenant federation host for WS-Trust endpoint reachability',
            '{"usernameMixedReachable": false, "windowsTransportReachable": false}'
        ),
        (
            'maes_entra_v100', 'MAES-FED-03', 'Federation',
            'Ensure the AD FS metadata exchange (MEX) endpoint is not publicly exposed',
            'The /adfs/services/trust/mex endpoint publishes the federation service metadata, including the set of supported endpoints and trust configuration.',
            'An exposed MEX endpoint lets an unauthenticated attacker enumerate the AD FS configuration and relying-party trusts without touching a credential, providing a target list for a subsequent Golden SAML or relying-party attack.',
            'Restricting MEX may break clients that discover endpoints dynamically. Most production clients use static configuration.',
            'Restrict the MEX endpoint to internal networks at the Web Application Proxy or reverse proxy. Do not publish it to the extranet.',
            'level1', 1.50, null, 'HTTP probe of the tenant federation host for /adfs/services/trust/mex',
            '{"mexExposed": false}'
        ),

        -- Section: Authentication Surface
        (
            'maes_entra_v100', 'MAES-AUTH-01', 'Authentication Surface',
            'Ensure resource owner password credentials (ROPC) sign-in is blocked',
            'The OAuth 2.0 resource owner password credentials grant sends a username and password directly to the token endpoint in exchange for a token.',
            'ROPC is a password-only flow. It cannot satisfy an interactive MFA challenge, so where it succeeds it provides an authentication path that sidesteps most MFA controls, and it is a favoured vehicle for credential stuffing and password spraying.',
            'Blocking ROPC breaks scripts and legacy applications that authenticate with a stored username and password. These should move to certificate or managed identity authentication.',
            'Create a Conditional Access policy that blocks the "Other clients" / legacy authentication client app types for all users, which covers ROPC. Migrate any application relying on ROPC to the authorization code or client credentials flow.',
            'level2', 2.50, '/identity/conditionalAccess/policies', 'Check Conditional Access policies for a block on legacy/other client app types',
            '{"ropcBlocked": true}'
        ),
        (
            'maes_entra_v100', 'MAES-AUTH-02', 'Authentication Surface',
            'Ensure legacy authentication protocols are blocked tenant-wide',
            'Legacy authentication protocols — Exchange ActiveSync with basic auth, EWS, MAPI over HTTP, POP, IMAP, SMTP AUTH, and the Offline Address Book — do not support modern authentication.',
            'Protocols that do not support modern authentication cannot present an MFA challenge. As long as any of them remain enabled, a valid username and password is sufficient to authenticate, which nullifies the tenant''s MFA investment for those paths.',
            'Blocking legacy authentication breaks older Outlook clients, multifunction devices that submit mail over SMTP AUTH, and any application using POP or IMAP. Inventory these before enforcing.',
            'Deploy a Conditional Access policy blocking legacy authentication clients for all users, with a scoped, time-limited exclusion group for any device that genuinely cannot be migrated. Disable per-mailbox legacy protocols in Exchange Online.',
            'level2', 3.00, '/identity/conditionalAccess/policies', 'Check for an enabled Conditional Access policy blocking legacy client app types',
            '{"legacyAuthBlocked": true, "policyState": "enabled"}'
        ),

        -- Section: MFA Coverage
        (
            'maes_entra_v100', 'MAES-MFA-01', 'MFA Coverage',
            'Ensure all enabled users have registered a strong authentication method',
            'Every enabled user account should have at least one multi-factor authentication method registered.',
            'A user with no registered MFA method cannot be protected by an MFA requirement. Unregistered accounts are also vulnerable to MFA registration hijacking, where an attacker who obtains the password enrols their own authenticator and takes lasting control of the account.',
            'Users without a registered method will be prompted to enrol at next sign-in, which requires communication and support capacity.',
            'Enforce registration through the Entra ID MFA registration policy or a Conditional Access policy targeting the "Register security information" user action, and drive remaining unregistered accounts down to zero.',
            'level1', 2.00, '/reports/authenticationMethods/userRegistrationDetails', 'Compare enabled users against MFA-registered users',
            '{"unregisteredEnabledUsers": 0}'
        ),
        (
            'maes_entra_v100', 'MAES-MFA-02', 'MFA Coverage',
            'Ensure all privileged role holders have registered a phishing-resistant method',
            'Members of privileged directory roles should have registered a phishing-resistant authentication method such as FIDO2, Windows Hello for Business, or certificate-based authentication.',
            'Privileged accounts are the highest-value target in the tenant. SMS and voice methods are vulnerable to SIM swap and interception, and push notifications are vulnerable to MFA fatigue; neither resists an adversary-in-the-middle phishing proxy. Phishing-resistant methods are the only ones that do.',
            'Requires distributing security keys or provisioning Windows Hello / certificate-based authentication to administrators.',
            'Register phishing-resistant methods for every privileged role holder and enforce them with a Conditional Access authentication strength policy targeting directory roles.',
            'level2', 3.00, '/reports/authenticationMethods/userRegistrationDetails', 'Cross-reference privileged role members against registered method types',
            '{"privilegedWithoutPhishingResistant": 0}'
        ),
        (
            'maes_entra_v100', 'MAES-MFA-03', 'MFA Coverage',
            'Ensure no enabled user is excluded from every MFA-enforcing policy',
            'Identify enabled users who fall outside the scope of all Conditional Access policies that require multi-factor authentication, whether through explicit exclusion or through never being included.',
            'MFA coverage is only as good as its weakest exclusion. Exclusion groups accumulate over time and are rarely reviewed, leaving accounts that can authenticate with a password alone — often exactly the accounts that were excluded because they are awkward, such as service accounts and executives.',
            'Removing exclusions may break the workflows the exclusions were created for. Each needs individual review.',
            'Review the exclusion list of every MFA-enforcing Conditional Access policy. Remove stale exclusions, replace standing exclusions with time-limited ones, and ensure every remaining exclusion is documented with an owner and a compensating control.',
            'level2', 2.50, '/identity/conditionalAccess/policies', 'Resolve include/exclude sets of MFA-enforcing policies against enabled users',
            '{"usersOutsideAllMfaPolicies": 0}'
        ),

        -- Section: Conditional Access
        (
            'maes_entra_v100', 'MAES-CA-01', 'Conditional Access',
            'Ensure Conditional Access policies are not left in report-only or disabled state',
            'Conditional Access policies have three states: enabled, disabled, and report-only. Only enabled policies enforce their grant controls.',
            'A report-only policy logs what it would have done but blocks nothing. Policies frequently stay in report-only long after their evaluation period ends, leaving the tenant with the appearance of a control that is not actually enforcing anything.',
            'Moving a policy to enabled begins enforcement and may block sign-ins that previously succeeded. Review the report-only impact data first.',
            'For each policy not in the enabled state, either promote it to enabled after reviewing its report-only impact, or delete it. Do not leave policies parked indefinitely in report-only.',
            'level1', 1.50, '/identity/conditionalAccess/policies', 'Report policy state distribution across all Conditional Access policies',
            '{"nonEnabledPolicies": 0}'
        ),
        (
            'maes_entra_v100', 'MAES-CA-02', 'Conditional Access',
            'Ensure break-glass and excluded principals are inventoried and constrained',
            'Enumerate every user, group, and role excluded from Conditional Access policies, and identify designated emergency access (break-glass) accounts.',
            'Excluded principals are, by definition, the accounts Conditional Access does not protect. Break-glass accounts are a legitimate and recommended exclusion, but they must be few, monitored, and held with strong credentials. Every other standing exclusion is an unmonitored bypass.',
            'Inventory only. Acting on the results requires per-exclusion review.',
            'Maintain no more than two cloud-only break-glass accounts, exclude them only from policies that could lock out all administrators, protect them with FIDO2 keys or long passphrases held in escrow, and alert on every sign-in they perform. Remove or time-bound all other exclusions.',
            'level1', 1.50, '/identity/conditionalAccess/policies', 'Aggregate excluded users, groups, and roles across all policies',
            '{"maxBreakGlassAccounts": 2, "undocumentedExclusions": 0}'
        ),

        -- Section: Application Identities
        (
            'maes_entra_v100', 'MAES-SP-01', 'Application Identities',
            'Ensure service principals do not hold high-privilege application permissions',
            'Identify service principals granted application permissions that confer tenant-wide privilege, such as RoleManagement.ReadWrite.Directory, AppRoleAssignment.ReadWrite.All, Directory.ReadWrite.All, or Mail.ReadWrite for all mailboxes.',
            'Application permissions apply tenant-wide and are not subject to Conditional Access or MFA — possession of the credential is sufficient. A service principal holding RoleManagement.ReadWrite.Directory or AppRoleAssignment.ReadWrite.All can grant itself Global Administrator, making it equivalent to a privileged account with none of the protections.',
            'Reducing an application''s permissions may break the workload that depends on them. Each grant needs to be traced to the functionality it supports.',
            'Review every application permission grant against what the application actually does. Replace tenant-wide grants with narrowly scoped alternatives (for example application access policies for mail, or resource-scoped role assignments). Remove grants with no identifiable owner.',
            'level2', 3.00, '/servicePrincipals', 'Enumerate app role assignments against a high-privilege permission list',
            '{"highPrivilegeServicePrincipals": 0}'
        ),
        (
            'maes_entra_v100', 'MAES-SP-02', 'Application Identities',
            'Ensure application credentials are current and not excessively long-lived',
            'Review the client secrets and certificates registered on applications and service principals for expiry, age, and remaining lifetime.',
            'A client secret is a bearer credential with no second factor. Long-lived secrets accumulate in scripts, pipelines, and configuration stores, and a secret valid for years remains usable long after the person who created it has left. Already-expired credentials indicate abandoned registrations that should be cleaned up.',
            'Rotating credentials requires coordinating with the consuming workload to avoid an outage.',
            'Prefer certificate credentials or managed identities over client secrets. Cap secret lifetime at the shortest workable interval, rotate on a schedule, and remove expired credentials and the orphaned registrations that hold them.',
            'level1', 1.50, '/servicePrincipals', 'Inspect keyCredentials and passwordCredentials for expiry and lifetime',
            '{"maxCredentialLifetimeDays": 365, "expiredCredentials": 0}'
        ),

        -- Section: Mail Authentication
        (
            'maes_entra_v100', 'MAES-MAIL-01', 'Mail Authentication',
            'Ensure SPF is published and does not end in a permissive all mechanism',
            'Each verified mail-enabled domain should publish an SPF (v=spf1) TXT record terminating in -all (hard fail) or at minimum ~all (soft fail), and never ?all or +all.',
            'SPF tells receiving servers which hosts may send mail for the domain. A record ending in ?all or +all authorises every host on the internet, and a missing record leaves receivers with no basis to reject forgeries. Either makes the domain trivially spoofable for phishing that appears to come from inside the organisation.',
            'Tightening SPF can cause legitimate mail from unlisted third-party senders to be rejected. Inventory all sending services before moving to -all.',
            'Publish an SPF record enumerating every legitimate sending service, then terminate it with -all. Keep the record within the ten DNS-lookup limit.',
            'level1', 2.00, '/domains', 'Resolve TXT records for each verified domain and parse the SPF mechanism',
            '{"spfPresent": true, "permissiveAll": false}'
        ),
        (
            'maes_entra_v100', 'MAES-MAIL-02', 'Mail Authentication',
            'Ensure DMARC is published with an enforcing policy',
            'Each verified mail-enabled domain should publish a _dmarc TXT record with p=quarantine or p=reject.',
            'DMARC is what actually instructs receivers to act on SPF and DKIM failures. A domain at p=none publishes telemetry but requests no enforcement, so forged mail is still delivered. Without an enforcing DMARC policy, SPF and DKIM provide reporting rather than protection.',
            'Moving to enforcement can cause legitimate mail that fails alignment to be quarantined or rejected. Progress p=none to p=quarantine to p=reject while monitoring aggregate reports.',
            'Publish a DMARC record, collect aggregate (rua) reports until legitimate senders are aligned, then raise the policy to p=quarantine and finally p=reject with pct=100.',
            'level2', 2.50, '/domains', 'Resolve _dmarc TXT records for each verified domain and parse the p= tag',
            '{"dmarcPresent": true, "policy": ["quarantine", "reject"]}'
        ),
        (
            'maes_entra_v100', 'MAES-MAIL-03', 'Mail Authentication',
            'Ensure DKIM signing is enabled for each mail-enabled domain',
            'Each mail-enabled domain should publish DKIM selector records and have DKIM signing enabled in Exchange Online.',
            'DKIM cryptographically binds a message to the sending domain and, unlike SPF, survives forwarding. Without DKIM, forwarded legitimate mail fails SPF alignment, which pressures administrators into keeping DMARC at p=none and undermines the whole mail authentication chain.',
            'Enabling DKIM requires publishing two CNAME records per domain and rotating keys periodically.',
            'Enable DKIM signing for every custom domain in the Microsoft 365 Defender portal, publish the selector1 and selector2 CNAME records, and confirm signatures appear on outbound mail.',
            'level1', 1.50, '/domains', 'Resolve selector CNAME/TXT records for each verified domain',
            '{"dkimPresent": true}'
        ),

        -- Section: DNS Posture
        (
            'maes_entra_v100', 'MAES-DNS-01', 'DNS Posture',
            'Ensure supporting mail and DNS security records are published',
            'Review each verified domain for MTA-STS, TLS-RPT, CAA, and DNSSEC configuration.',
            'These records harden the transport and issuance layers beneath mail authentication. MTA-STS prevents an attacker from stripping TLS during mail delivery, TLS-RPT surfaces when that happens, and CAA restricts which certificate authorities may issue for the domain — limiting an attacker''s ability to obtain a valid certificate for a lookalike service.',
            'Advisory. MTA-STS in enforce mode can block mail delivery if the policy or certificates are misconfigured; deploy in testing mode first.',
            'Publish a CAA record naming only the certificate authorities in use. Deploy MTA-STS in testing mode with TLS-RPT reporting, then move to enforce once reports are clean. Enable DNSSEC where the registrar and DNS provider support it.',
            'level2', 1.00, '/domains', 'Resolve MTA-STS, TLS-RPT, CAA, and DNSSEC records per verified domain',
            '{"caaPresent": true, "mtaStsPresent": true, "tlsRptPresent": true}'
        );

        RAISE NOTICE 'Loaded MAES Entra posture controls (maes_entra_v100)';
    ELSE
        RAISE NOTICE 'MAES Entra posture controls already present, skipping';
    END IF;
END $$;
