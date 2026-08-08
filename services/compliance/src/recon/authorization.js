const db = require('../services/database');

/**
 * Scope authorization for external exposure scans.
 *
 * A recon scan sends traffic to hosts outside MAES. The passive and standard
 * tiers are confined to the organisation's own verified domains; the aggressive
 * tier enumerates and reaches third-party platforms, and is refused outright
 * without a current, recorded authorization covering the seed domain.
 *
 * This is enforced here, in one place, rather than in each phase — a phase
 * cannot opt itself out of it.
 */

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

/** Does an authorization's domain list cover this seed domain? */
function coversDomain(domains, seedDomain) {
  const target = String(seedDomain).toLowerCase().replace(/\.$/, '');
  return (domains || []).some((entry) => {
    const authorized = String(entry).toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    return target === authorized || target.endsWith(`.${authorized}`);
  });
}

/** Is the organisation's own verified domain list a match for the seed domain? */
async function isOrganizationDomain(organizationId, seedDomain) {
  const org = await db.getRow(
    `SELECT fqdn, credentials, metadata FROM maes.organizations WHERE id = $1`,
    [organizationId]
  );
  if (!org) return false;

  const candidates = [
    org.fqdn,
    org.credentials?.tenantDomain,
    org.credentials?.domain,
    ...(org.metadata?.verifiedDomains || [])
  ].filter(Boolean);

  return coversDomain(candidates, seedDomain);
}

/** Active, non-expired, non-revoked authorizations for the organisation. */
async function getActiveAuthorizations(organizationId) {
  return db.getRows(
    `SELECT id, domains, profile_ceiling, authorized_by, authorized_by_name,
            authorization_reference, authorized_at, expires_at
       FROM maes.recon_authorizations
      WHERE organization_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY expires_at DESC`,
    [organizationId]
  );
}

const PROFILE_ORDER = ['passive', 'standard', 'aggressive'];

/**
 * Decide whether a scan may proceed.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.seedDomain
 * @param {string} params.profile
 * @returns {Promise<{authorizationId: string|null, basis: string}>}
 * @throws {AuthorizationError} when the scan is not permitted
 */
async function authorizeScan({ organizationId, seedDomain, profile }) {
  if (!PROFILE_ORDER.includes(profile)) {
    throw new AuthorizationError(`Unknown scan profile '${profile}'`);
  }

  const authorizations = await getActiveAuthorizations(organizationId);
  const covering = authorizations.filter(a => coversDomain(a.domains, seedDomain));

  if (profile === 'aggressive') {
    const permitting = covering.find(a => a.profile_ceiling === 'aggressive');
    if (!permitting) {
      throw new AuthorizationError(
        `An aggressive scan of ${seedDomain} requires a current authorization record covering that domain `
        + 'with a profile ceiling of "aggressive". This tier performs account enumeration and probes '
        + 'third-party platforms, so it is not run on an implicit basis. '
        + (covering.length > 0
          ? `Found ${covering.length} authorization(s) for this domain, but none permits the aggressive tier.`
          : 'No current authorization covers this domain.')
      );
    }
    return { authorizationId: permitting.id, basis: 'explicit_authorization' };
  }

  // Passive and standard are permitted against the organisation's own domains
  // without a separate attestation, and otherwise need one.
  const permitting = covering.find(a =>
    PROFILE_ORDER.indexOf(a.profile_ceiling) >= PROFILE_ORDER.indexOf(profile));

  if (permitting) {
    return { authorizationId: permitting.id, basis: 'explicit_authorization' };
  }

  if (await isOrganizationDomain(organizationId, seedDomain)) {
    return { authorizationId: null, basis: 'organization_owned_domain' };
  }

  throw new AuthorizationError(
    `${seedDomain} is not a registered domain for this organization, and no current authorization record `
    + `covers it at the '${profile}' profile. Add the domain to the organization, or record a scope `
    + 'authorization before scanning it.'
  );
}

module.exports = {
  authorizeScan,
  getActiveAuthorizations,
  coversDomain,
  isOrganizationDomain,
  AuthorizationError,
  PROFILE_ORDER
};
