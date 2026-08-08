/**
 * Finding definitions for external exposure scans.
 *
 * Phases decide *whether* something is present; this file decides what it
 * means. Keeping severity, impact, remediation and MITRE mapping here — rather
 * than inline in detection code — means the risk judgements are reviewable in
 * one place, the same separation the compliance side gets from storing control
 * definitions in the database.
 *
 * Each entry:
 *   severity   critical | high | medium | low | info
 *   tags       attack-chain enablers; attackPaths.js matches on these
 *   mitre      ATT&CK technique id, where one applies
 */

const CATALOG = {
  // --- Tenant and identity fingerprinting --------------------------------
  'TENANT-IDENTIFIED': {
    title: 'Microsoft 365 tenant identified',
    severity: 'info',
    tags: ['TENANT-CONFIRMED'],
    description: 'The domain resolves to a Microsoft 365 / Entra ID tenant, and the tenant identifier is publicly discoverable.',
    impact: 'Tenant identifiers are public by design and are required for normal authentication. Knowing it lets an attacker target tenant-specific endpoints and confirms which cloud and region the organisation uses.',
    remediation: 'No action required; this cannot be hidden. Treat it as the starting point an attacker has, and ensure the controls that matter downstream — MFA coverage, legacy authentication, Conditional Access — are in place.',
    mitre: 'T1590'
  },
  'TENANT-MANAGED-AUTH': {
    title: 'Domain uses managed (cloud) authentication',
    severity: 'info',
    tags: ['AUTH-MANAGED'],
    description: 'The domain authenticates directly against Entra ID rather than being federated to an external identity provider.',
    impact: 'Managed authentication keeps the credential path inside Entra ID, where Conditional Access and MFA apply consistently. This is the preferred configuration.',
    remediation: 'No action required.',
    mitre: null
  },
  'FED-ADFS-DETECTED': {
    title: 'Domain is federated to an external identity provider',
    severity: 'low',
    tags: ['FED-ADFS-DETECTED'],
    description: 'The domain is federated; authentication is redirected to an identity provider the organisation operates.',
    impact: 'Federation moves the credential path onto infrastructure outside Entra ID. Compromise of the token-signing certificate allows forged assertions for any user in the domain, bypassing MFA and Conditional Access entirely (Golden SAML).',
    remediation: 'Confirm the federation is still required. Where it is not, convert the domain to managed authentication. Where it is, treat the federation servers as tier-0 infrastructure with the same protections as a domain controller.',
    mitre: 'T1606.002'
  },
  'FED-ADFS-MEX-EXPOSED': {
    title: 'AD FS metadata exchange endpoint publicly reachable',
    severity: 'medium',
    tags: ['FED-ADFS-DETECTED', 'FED-ADFS-MEX-EXPOSED'],
    description: 'The AD FS /adfs/services/trust/mex endpoint answers requests from the internet.',
    impact: 'Allows unauthenticated enumeration of the federation configuration and relying-party trusts, providing a target list for a subsequent Golden SAML or relying-party attack without touching a credential.',
    remediation: 'Restrict the MEX endpoint to internal networks at the Web Application Proxy or reverse proxy. Production clients use static endpoint configuration and do not need it published externally.',
    mitre: 'T1590.002'
  },
  'FED-WSTRUST-EXPOSED': {
    title: 'AD FS legacy WS-Trust endpoint publicly reachable',
    severity: 'high',
    tags: ['FED-ADFS-DETECTED', 'FED-WSTRUST-EXPOSED', 'MFA-BYPASS-PATH'],
    description: 'A WS-Trust usernamemixed or windowstransport endpoint accepts requests from the internet.',
    impact: 'These endpoints accept a username and password directly and never reach Entra ID as an interactive sign-in, so Conditional Access and Entra MFA do not apply. They are the standard target for password spraying against federated tenants.',
    remediation: 'Disable the WS-Trust 1.3 and 2005 username-mixed and Windows-transport endpoints for extranet access in AD FS, or block them at the Web Application Proxy. Enforce MFA at AD FS itself for any path that must remain.',
    mitre: 'T1110.003'
  },

  // --- Mail authentication -----------------------------------------------
  'MAIL-SPF-MISSING': {
    title: 'No SPF record published',
    severity: 'medium',
    tags: ['MAIL-SPOOFABLE'],
    description: 'The domain publishes no v=spf1 TXT record.',
    impact: 'Receiving servers have no basis on which to reject mail forged from this domain, making internal-looking phishing straightforward.',
    remediation: 'Publish an SPF record enumerating every legitimate sending service and terminate it with -all, staying within the ten DNS-lookup limit.',
    mitre: 'T1566'
  },
  'MAIL-SPF-PERMISSIVE': {
    title: 'SPF record ends in a permissive all mechanism',
    severity: 'medium',
    tags: ['MAIL-SPOOFABLE'],
    description: 'The SPF record terminates in ?all or +all, which authorises any host on the internet to send for the domain.',
    impact: 'A permissive terminal mechanism is close to having no SPF record at all: receivers are told every sender is acceptable.',
    remediation: 'Change the terminal mechanism to -all after inventorying legitimate senders, or to ~all as an interim step while monitoring DMARC aggregate reports.',
    mitre: 'T1566'
  },
  'MAIL-DMARC-MISSING': {
    title: 'No DMARC record published',
    severity: 'medium',
    tags: ['MAIL-SPOOFABLE'],
    description: 'The domain publishes no _dmarc TXT record.',
    impact: 'Without DMARC, receivers are given no instruction to act on SPF or DKIM failures, so forged mail is generally still delivered regardless of how well SPF is configured.',
    remediation: 'Publish a DMARC record, collect aggregate (rua) reports until legitimate senders are aligned, then raise the policy to p=quarantine and finally p=reject.',
    mitre: 'T1566'
  },
  'MAIL-DMARC-NOT-ENFORCING': {
    title: 'DMARC policy is not enforcing',
    severity: 'low',
    tags: ['MAIL-SPOOFABLE'],
    description: 'A DMARC record exists but is set to p=none, or applies to only a fraction of messages.',
    impact: 'The domain collects DMARC telemetry but requests no enforcement, so forged mail continues to be delivered.',
    remediation: 'Once aggregate reports show legitimate senders are aligned, raise the policy to p=quarantine and then p=reject with pct=100.',
    mitre: 'T1566'
  },
  'MAIL-DKIM-MISSING': {
    title: 'No DKIM selectors published',
    severity: 'low',
    tags: ['MAIL-SPOOFABLE'],
    description: 'No DKIM selector records were found for the domain.',
    impact: 'Without DKIM, forwarded legitimate mail fails SPF alignment, which in practice keeps organisations from raising DMARC to enforcement — so the whole mail authentication chain stays advisory.',
    remediation: 'Enable DKIM signing for the domain in the Microsoft 365 Defender portal and publish the selector CNAME records.',
    mitre: null
  },
  'DNS-CAA-MISSING': {
    title: 'No CAA record published',
    severity: 'low',
    tags: ['DNS-WEAK'],
    description: 'The domain publishes no Certificate Authority Authorization record.',
    impact: 'Any certificate authority may issue a certificate for the domain. A CAA record narrows which authorities an attacker could induce to issue a valid certificate for a lookalike service.',
    remediation: 'Publish a CAA record naming only the certificate authorities actually in use.',
    mitre: null
  },
  'DNS-MTASTS-MISSING': {
    title: 'No MTA-STS policy published',
    severity: 'low',
    tags: ['DNS-WEAK'],
    description: 'The domain publishes no MTA-STS policy record.',
    impact: 'Without MTA-STS, an attacker positioned in the network path can strip TLS from inbound mail delivery and read it in clear text.',
    remediation: 'Deploy MTA-STS in testing mode alongside TLS-RPT reporting, then move to enforce once the reports are clean.',
    mitre: 'T1557'
  },

  // --- Exposed surface ----------------------------------------------------
  'SUBDOMAIN-TAKEOVER-CANDIDATE': {
    title: 'Dangling DNS record pointing at a claimable cloud resource',
    severity: 'high',
    tags: ['SUBDOMAIN-TAKEOVER', 'CONTENT-INJECTION'],
    description: 'A CNAME points at a decommissioned Azure or third-party resource whose name appears unclaimed.',
    impact: 'An attacker who registers the target resource name serves content from a hostname the organisation owns. That defeats phishing training, can capture cookies scoped to the parent domain, and is often accepted as proof of domain control for certificate issuance.',
    remediation: 'Remove the dangling DNS record, or re-claim the target resource. Audit DNS for records pointing at resources that no longer exist as part of decommissioning.',
    mitre: 'T1584.001'
  },
  'AZURE-STORAGE-PUBLIC-CONTAINER': {
    title: 'Azure Storage container allows anonymous listing',
    severity: 'critical',
    tags: ['DATA-EXPOSURE', 'ANON-READ'],
    description: 'A storage container associated with the organisation returns a blob listing to unauthenticated requests.',
    impact: 'Anonymous listing exposes every object name in the container and, where blob-level anonymous read is also enabled, the objects themselves. This is a direct unauthenticated data exfiltration path.',
    remediation: 'Set the container public access level to Private, disable anonymous blob access at the storage account, and review access logs for prior anonymous reads.',
    mitre: 'T1530'
  },
  'SHAREPOINT-ANON-ACCESS': {
    title: 'SharePoint resource reachable without authentication',
    severity: 'high',
    tags: ['DATA-EXPOSURE', 'ANON-READ'],
    description: 'A SharePoint REST endpoint or site returned content to an unauthenticated request.',
    impact: 'Anonymous access to SharePoint APIs can expose site structure, user names, and in some configurations document content, without any credential.',
    remediation: 'Review the site\'s anonymous access and sharing settings, disable anonymous links where not required, and restrict the legacy /_vti_bin/ and /_api/ surface.',
    mitre: 'T1213.002'
  },
  'DATAVERSE-ANON-ODATA': {
    title: 'Dataverse OData entity readable anonymously',
    severity: 'critical',
    tags: ['DATA-EXPOSURE', 'ANON-READ'],
    description: 'A Power Pages site exposes Dataverse entity data through OData without requiring authentication.',
    impact: 'Directly exposes business records — commonly contacts, accounts and cases — to anyone who knows the URL. This is one of the highest-yield unauthenticated exposures in the Microsoft ecosystem.',
    remediation: 'Review table permissions and site settings for the Power Pages portal, disable the OData feed for entities that do not need it, and require authentication for the remainder.',
    mitre: 'T1530'
  },
  'FUNCTION-APP-ANON-ENDPOINT': {
    title: 'Azure Function endpoint responds without a key',
    severity: 'high',
    tags: ['ANON-EXEC'],
    description: 'A function endpoint returned a non-error response to an unauthenticated request.',
    impact: 'An anonymous-authorisation function can be invoked by anyone. Depending on what it does, that ranges from information disclosure to attacker-controlled execution inside the organisation\'s cloud environment.',
    remediation: 'Set the function authorisation level to function or admin, or place the app behind Entra ID authentication (Easy Auth) or API Management.',
    mitre: 'T1190'
  },
  'APP-SERVICE-KUDU-EXPOSED': {
    title: 'App Service management (Kudu) endpoint reachable',
    severity: 'medium',
    tags: ['MGMT-EXPOSED'],
    description: 'The SCM/Kudu site for an App Service responds to unauthenticated requests.',
    impact: 'Kudu provides a file browser, console and deployment interface. Reachability alone is not compromise, but it substantially widens what a stolen credential is worth.',
    remediation: 'Restrict SCM site access to trusted networks or private endpoints, and disable basic authentication for SCM publishing.',
    mitre: 'T1190'
  },
  'HTTP-SECURITY-HEADERS-WEAK': {
    title: 'Web host missing key security response headers',
    severity: 'low',
    tags: ['WEB-WEAK'],
    description: 'A discovered web host does not send HSTS, Content-Security-Policy, or X-Frame-Options.',
    impact: 'Missing HSTS allows a downgrade to plaintext on first contact; missing CSP and frame options make cross-site scripting and clickjacking easier to exploit against users of the site.',
    remediation: 'Add Strict-Transport-Security, a Content-Security-Policy, and X-Frame-Options (or CSP frame-ancestors) at the origin or CDN.',
    mitre: null
  },
  'MGMT-PORTAL-EXPOSED': {
    title: 'Management or administrative interface publicly reachable',
    severity: 'medium',
    tags: ['MGMT-EXPOSED'],
    description: 'An administrative interface associated with the organisation answers unauthenticated requests from the internet.',
    impact: 'Publicly reachable management interfaces are a standing target for credential attacks and for exploitation of any authentication bypass in the product.',
    remediation: 'Place the interface behind a private endpoint, VPN, or Conditional Access-protected proxy, and restrict source addresses where the product supports it.',
    mitre: 'T1133'
  },

  // --- Enumeration (aggressive profile) -----------------------------------
  'USER-ENUM-POSSIBLE': {
    title: 'Valid account names can be confirmed anonymously',
    severity: 'medium',
    tags: ['USER-ENUM', 'MFA-BYPASS-PATH'],
    description: 'The tenant returns distinguishable responses for existing and non-existing accounts, allowing account names to be validated without authenticating.',
    impact: 'Lets an attacker build a verified user list before spraying, which raises the success rate and lowers the volume of failed sign-ins that would otherwise trigger detection.',
    remediation: 'This behaviour is largely inherent to the Microsoft sign-in endpoints and cannot be fully suppressed. Compensate with Entra ID Password Protection, smart lockout, and alerting on sign-in failure patterns, and ensure MFA coverage has no gaps.',
    mitre: 'T1087.004'
  },
  'SUBSCRIPTION-ID-LEAKED': {
    title: 'Azure subscription identifier disclosed',
    severity: 'low',
    tags: ['INFO-LEAK'],
    description: 'An Azure subscription GUID was recovered from a publicly served response.',
    impact: 'Subscription identifiers are not secrets, but they let an attacker target resource-specific endpoints precisely and correlate assets across an estate.',
    remediation: 'Remove subscription identifiers from publicly served content, error pages and client-side bundles.',
    mitre: 'T1590'
  },
  'CROSS-SAAS-TENANT-FOUND': {
    title: 'Third-party SaaS tenant found for this organisation',
    severity: 'info',
    tags: ['SAAS-INVENTORY'],
    description: 'A tenant or organisation account matching this domain exists on a third-party SaaS platform.',
    impact: 'Expands the identity perimeter beyond Microsoft. Each additional platform is another place where credentials can be phished and where SSO and offboarding may not be enforced consistently.',
    remediation: 'Confirm the tenant is sanctioned, bring it under SSO with the corporate identity provider, and include it in joiner-mover-leaver processes.',
    mitre: 'T1593'
  },

  // --- Leads (analyst actions rather than confirmed findings) -------------
  'LEAD-CODE-SEARCH': {
    title: 'Suggested code-search queries for leaked secrets',
    severity: 'info',
    tags: ['LEAD'],
    description: 'Search queries an analyst can run against public code hosts to look for credentials, webhook URLs and configuration referencing this organisation.',
    impact: 'Not a finding. Executing these searches requires a third-party API credential that MAES will not spend without explicit configuration.',
    remediation: 'Run the listed queries manually, or configure a code-search API credential for this organisation to have MAES execute them.',
    mitre: 'T1593.003'
  },
  'LEAD-BREACH-INTEL': {
    title: 'Suggested breach-intelligence lookups',
    severity: 'info',
    tags: ['LEAD'],
    description: 'Breach-corpus lookups an analyst can run for this domain.',
    impact: 'Not a finding. Requires a third-party API credential that MAES will not spend without explicit configuration.',
    remediation: 'Run the listed lookups manually, or configure a breach-intelligence API credential for this organisation.',
    mitre: 'T1589.001'
  }
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/** Rank for sorting; lower is more severe. */
function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/**
 * Build a finding from its catalog entry.
 *
 * @param {string} findingId - catalog key
 * @param {Object} details
 * @param {string} details.phase
 * @param {string} [details.target] - host, domain or URL the finding concerns
 * @param {Object} [details.evidence]
 * @param {string} [details.titleSuffix] - appended to distinguish repeats, e.g. the host
 * @param {string} [details.severity] - override, for cases the phase can grade better
 * @param {string[]} [details.extraTags]
 * @param {boolean} [details.isLead]
 */
function buildFinding(findingId, details = {}) {
  const entry = CATALOG[findingId];
  if (!entry) {
    throw new Error(`Unknown finding id '${findingId}'. Add it to recon/findings/catalog.js first.`);
  }

  return {
    findingId,
    phase: details.phase,
    title: details.titleSuffix ? `${entry.title}: ${details.titleSuffix}` : entry.title,
    description: entry.description,
    severity: details.severity || entry.severity,
    tags: [...entry.tags, ...(details.extraTags || [])],
    target: details.target || null,
    evidence: details.evidence || {},
    impact: entry.impact,
    remediation: entry.remediation,
    mitreTechnique: entry.mitre,
    isLead: details.isLead ?? entry.tags.includes('LEAD')
  };
}

module.exports = {
  CATALOG,
  SEVERITY_ORDER,
  severityRank,
  buildFinding
};
