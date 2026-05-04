const GraphClientWrapper = require('../clients/graphClient');
const OutputWriter = require('../utils/outputWriter');
const ProgressTracker = require('../utils/progressTracker');
const graphAuthService = require('../auth/graphAuth');
const { logger } = require('../logger');

// Tier 1: Native Graph extractors
const SignInLogsExtractor = require('./signInLogsExtractor');
const AuditLogsExtractor = require('./auditLogsExtractor');
const MfaStatusExtractor = require('./mfaStatusExtractor');
const OauthPermissionsExtractor = require('./oauthPermissionsExtractor');
const RiskyUsersExtractor = require('./riskyUsersExtractor');
const RiskyDetectionsExtractor = require('./riskyDetectionsExtractor');
const DevicesExtractor = require('./devicesExtractor');
const AdminUsersExtractor = require('./adminUsersExtractor');
const ConditionalAccessExtractor = require('./conditionalAccessExtractor');
const LicensesExtractor = require('./licensesExtractor');
const LicensesByUserExtractor = require('./licensesByUserExtractor');
const LicenseCompatibilityExtractor = require('./licenseCompatibilityExtractor');
const EntraSecurityDefaultsExtractor = require('./entraSecurityDefaultsExtractor');
const GroupsExtractor = require('./groupsExtractor');
const PimAssignmentsExtractor = require('./pimAssignmentsExtractor');
const RoleActivityExtractor = require('./roleActivityExtractor');
const SecurityAlertsExtractor = require('./securityAlertsExtractor');
const UalGraphExtractor = require('./ualGraphExtractor');

// Tier 2: Partial Graph extractors
const MailboxRulesExtractor = require('./mailboxRulesExtractor');
const MailboxAuditStatusExtractor = require('./mailboxAuditStatusExtractor');
const MailboxPermissionsExtractor = require('./mailboxPermissionsExtractor');

// Registry maps extraction type keys to extractor classes or 'powershell' fallback
const extractorRegistry = {
  // Tier 1: Native Graph API
  azure_signin_logs: SignInLogsExtractor,
  azure_audit_logs: AuditLogsExtractor,
  mfa_status: MfaStatusExtractor,
  oauth_permissions: OauthPermissionsExtractor,
  risky_users: RiskyUsersExtractor,
  risky_detections: RiskyDetectionsExtractor,
  devices: DevicesExtractor,
  admin_users: AdminUsersExtractor,
  conditional_access_policies: ConditionalAccessExtractor,
  licenses: LicensesExtractor,
  licenses_by_user: LicensesByUserExtractor,
  license_compatibility: LicenseCompatibilityExtractor,
  entra_security_defaults: EntraSecurityDefaultsExtractor,
  groups: GroupsExtractor,
  group_members: GroupsExtractor,       // reuses GroupsExtractor with flag
  dynamic_groups: GroupsExtractor,       // reuses GroupsExtractor with flag
  pim_assignments: PimAssignmentsExtractor,
  role_activity: RoleActivityExtractor,
  security_alerts: SecurityAlertsExtractor,
  ual_graph: UalGraphExtractor,
  activity_logs: AuditLogsExtractor,     // alias for azure_audit_logs
  directory_activity_logs: AuditLogsExtractor, // alias

  // Tier 2: Partial Graph
  mailbox_rules: MailboxRulesExtractor,
  mailbox_audit_status: MailboxAuditStatusExtractor,
  mailbox_permissions: MailboxPermissionsExtractor,

  // Tier 3: PowerShell fallback (Exchange-only)
  unified_audit_log: 'powershell',
  admin_audit_log: 'powershell',
  mailbox_audit: 'powershell',
  transport_rules: 'powershell',
  message_trace: 'powershell',

  // Tier 4: Composite
  full_extraction: 'composite' // handled specially
};

/**
 * Check if an extraction type has a native Graph implementation.
 *
 * @param {string} type - Extraction type key
 * @returns {boolean}
 */
function isNativeGraph(type) {
  const entry = extractorRegistry[type];
  return entry !== undefined && entry !== 'powershell' && entry !== 'composite';
}

/**
 * Check if an extraction type requires PowerShell.
 *
 * @param {string} type - Extraction type key
 * @returns {boolean}
 */
function requiresPowerShell(type) {
  return extractorRegistry[type] === 'powershell';
}

/**
 * Dispatch an extraction job to the appropriate native or PowerShell handler.
 *
 * @param {string} type - Extraction type
 * @param {Object} parameters - Extraction parameters
 * @param {Object} credentials - Organization credentials
 * @param {string} organizationId - Organization ID
 * @param {string} orgOutputPath - Output directory path
 * @param {Object} job - BullMQ job for progress updates
 * @returns {Object[]} Array of output file descriptors
 */
async function dispatchExtraction(type, parameters, credentials, organizationId, orgOutputPath, job) {
  const ExtractorClass = extractorRegistry[type];

  if (!ExtractorClass) {
    throw new Error(`Unknown extraction type: ${type}`);
  }

  if (ExtractorClass === 'powershell') {
    // Return null to signal caller should use PowerShell adapter
    return null;
  }

  if (ExtractorClass === 'composite') {
    // full_extraction aggregates multiple types
    return await dispatchFullExtraction(parameters, credentials, organizationId, orgOutputPath, job);
  }

  // Set up Graph auth and client
  const progressTracker = new ProgressTracker(type, job);
  await progressTracker.updatePhase('authenticating');

  const graphClient = await graphAuthService.getGraphClient(organizationId, credentials);
  const clientWrapper = new GraphClientWrapper(graphClient, {
    onProgress: ({ fetched, page }) => {
      progressTracker.incrementRecords(fetched);
    }
  });

  const outputWriter = new OutputWriter(orgOutputPath, type, job?.id || 'unknown');
  await outputWriter.ensureDir();

  await progressTracker.updatePhase('fetching');

  const extractor = new ExtractorClass(clientWrapper, progressTracker, outputWriter);
  const results = await extractor.extract(parameters, type); // pass type for aliases like group_members

  await progressTracker.complete();
  return results;
}

/**
 * Handle full_extraction by dispatching all applicable sub-types.
 */
async function dispatchFullExtraction(parameters, credentials, organizationId, orgOutputPath, job) {
  const allTypes = Object.keys(extractorRegistry).filter(
    t => t !== 'full_extraction' && extractorRegistry[t] !== 'powershell'
  );

  const allResults = [];
  for (const subType of allTypes) {
    try {
      const results = await dispatchExtraction(subType, parameters, credentials, organizationId, orgOutputPath, job);
      if (results) {
        allResults.push(...results);
      }
    } catch (err) {
      logger.warn(`Sub-extraction ${subType} failed in full_extraction: ${err.message}`);
    }
  }
  return allResults;
}

/**
 * Get the list of all extraction types that have native Graph implementations.
 */
function getNativeTypes() {
  return Object.entries(extractorRegistry)
    .filter(([, v]) => v !== 'powershell' && v !== 'composite')
    .map(([k]) => k);
}

/**
 * Get the list of extraction types that still require PowerShell.
 */
function getPowerShellTypes() {
  return Object.entries(extractorRegistry)
    .filter(([, v]) => v === 'powershell')
    .map(([k]) => k);
}

module.exports = {
  extractorRegistry,
  isNativeGraph,
  requiresPowerShell,
  dispatchExtraction,
  getNativeTypes,
  getPowerShellTypes
};