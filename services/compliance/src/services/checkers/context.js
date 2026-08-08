const dns = require('dns').promises;
const axios = require('axios');
const { logger } = require('../../logger');

/**
 * Shared data loaders and probe helpers for the maes_entra_v100 control checkers.
 *
 * The engine invokes checkers one at a time with only (graphClient, control), so
 * without memoisation sixteen controls would re-fetch the same domain list, CA
 * policy set, user list and service principal inventory. Results are cached per
 * Graph client for the lifetime of a single assessment run; a new run builds a
 * new client and therefore starts with a cold cache.
 */
const caches = new WeakMap();

function cacheFor(graphClient) {
  let cache = caches.get(graphClient);
  if (!cache) {
    cache = new Map();
    caches.set(graphClient, cache);
  }
  return cache;
}

/**
 * Memoise an async loader against a Graph client.
 * @param {Object} graphClient
 * @param {string} key
 * @param {Function} loader
 */
async function memo(graphClient, key, loader) {
  const cache = cacheFor(graphClient);
  if (!cache.has(key)) {
    // Store the promise, not the value, so concurrent callers share one fetch.
    cache.set(key, loader().catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
}

/** Clear cached data for a Graph client. Exposed for tests. */
function resetCache(graphClient) {
  caches.delete(graphClient);
}

/**
 * Page through a Graph collection, preferring the getAllPages helper attached by
 * GraphClientService and falling back to a plain request when it is absent (for
 * example in tests using a bare mock client).
 */
async function getAll(graphClient, endpoint, options = {}) {
  if (typeof graphClient.getAllPages === 'function') {
    return graphClient.getAllPages(endpoint, options);
  }

  let request = graphClient.api(endpoint);
  if (options.select) request = request.select(options.select.join(','));
  if (options.filter) request = request.filter(options.filter);
  if (options.top) request = request.top(options.top);
  if (options.headers) request = request.headers(options.headers);
  const response = await request.get();
  return response.value || [];
}

// --- Graph loaders -------------------------------------------------------

/** Verified domains on the tenant, including authenticationType. */
async function getDomains(graphClient) {
  return memo(graphClient, 'domains', async () => {
    const domains = await getAll(graphClient, '/domains');
    return domains.filter(d => d.isVerified !== false);
  });
}

/** Domains that are federated to an external IdP. */
async function getFederatedDomains(graphClient) {
  const domains = await getDomains(graphClient);
  return domains.filter(d => d.authenticationType === 'Federated');
}

/** Domains capable of sending mail. */
async function getMailDomains(graphClient) {
  const domains = await getDomains(graphClient);
  return domains.filter(d => Array.isArray(d.supportedServices)
    ? d.supportedServices.includes('Email')
    : true);
}

/** All Conditional Access policies. */
async function getConditionalAccessPolicies(graphClient) {
  return memo(graphClient, 'caPolicies', () =>
    getAll(graphClient, '/identity/conditionalAccess/policies'));
}

/** All enabled member (non-guest) users. */
async function getEnabledUsers(graphClient) {
  return memo(graphClient, 'enabledUsers', async () => {
    const users = await getAll(graphClient, '/users', {
      select: ['id', 'displayName', 'userPrincipalName', 'accountEnabled', 'userType'],
      top: 999
    });
    return users.filter(u => u.accountEnabled !== false);
  });
}

/** MFA registration detail report for every user. */
async function getUserRegistrationDetails(graphClient) {
  return memo(graphClient, 'registrationDetails', () =>
    getAll(graphClient, '/reports/authenticationMethods/userRegistrationDetails', { top: 999 }));
}

/** Service principals with their credentials. */
async function getServicePrincipals(graphClient) {
  return memo(graphClient, 'servicePrincipals', () =>
    getAll(graphClient, '/servicePrincipals', {
      select: [
        'id', 'appId', 'displayName', 'servicePrincipalType', 'accountEnabled',
        'keyCredentials', 'passwordCredentials', 'appOwnerOrganizationId'
      ],
      top: 999
    }));
}

/** Activated directory roles with their members resolved. */
async function getDirectoryRolesWithMembers(graphClient) {
  return memo(graphClient, 'directoryRoles', async () => {
    const roles = await getAll(graphClient, '/directoryRoles');
    const withMembers = [];

    for (const role of roles) {
      try {
        const members = await getAll(graphClient, `/directoryRoles/${role.id}/members`);
        withMembers.push({ ...role, members });
      } catch (error) {
        logger.warn(`Could not resolve members of role ${role.displayName}: ${error.message}`);
        withMembers.push({ ...role, members: [], memberResolutionError: error.message });
      }
    }

    return withMembers;
  });
}

// --- DNS helpers ---------------------------------------------------------

async function resolveTxt(name) {
  try {
    const records = await dns.resolveTxt(name);
    // Node returns each record as an array of string chunks that must be joined.
    return records.map(chunks => chunks.join(''));
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return [];
    throw error;
  }
}

async function resolveCname(name) {
  try {
    return await dns.resolveCname(name);
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return [];
    throw error;
  }
}

async function resolveCaa(name) {
  try {
    return await dns.resolveCaa(name);
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return [];
    throw error;
  }
}

// --- HTTP probe ----------------------------------------------------------

const PROBE_TIMEOUT_MS = 8000;
const PROBE_USER_AGENT = 'MAES-Assessment/1.0 (+posture-assessment)';

/**
 * Issue a single read-only probe against a tenant-owned endpoint.
 * Never throws: a failure to connect is itself a result.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @returns {{reachable: boolean, statusCode: number|null, error: string|null, url: string}}
 */
async function probe(url, options = {}) {
  try {
    const response = await axios.request({
      url,
      method: options.method || 'GET',
      timeout: options.timeout || PROBE_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { 'User-Agent': PROBE_USER_AGENT, ...(options.headers || {}) },
      // Treat any HTTP response as a result rather than an exception; only
      // transport-level failures mean "not reachable".
      validateStatus: () => true
    });

    return {
      url,
      reachable: true,
      statusCode: response.status,
      error: null
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      statusCode: error.response ? error.response.status : null,
      error: error.code || error.message
    };
  }
}

/**
 * Resolve the federation host for a federated domain via the unauthenticated
 * user-realm endpoint, which reports the AuthURL for federated domains.
 * @param {string} domainName
 * @returns {string|null} federation hostname, or null if not federated/unknown
 */
async function getFederationHost(domainName) {
  try {
    const response = await axios.get(
      `https://login.microsoftonline.com/getuserrealm.srf?login=user@${encodeURIComponent(domainName)}&json=1`,
      { timeout: PROBE_TIMEOUT_MS, headers: { 'User-Agent': PROBE_USER_AGENT } }
    );

    const authUrl = response.data && (response.data.AuthURL || response.data.STSAuthURL);
    if (!authUrl) return null;
    return new URL(authUrl).hostname;
  } catch (error) {
    logger.debug(`Could not resolve federation host for ${domainName}: ${error.message}`);
    return null;
  }
}

module.exports = {
  memo,
  resetCache,
  getAll,
  getDomains,
  getFederatedDomains,
  getMailDomains,
  getConditionalAccessPolicies,
  getEnabledUsers,
  getUserRegistrationDetails,
  getServicePrincipals,
  getDirectoryRolesWithMembers,
  resolveTxt,
  resolveCname,
  resolveCaa,
  probe,
  getFederationHost,
  PROBE_USER_AGENT
};
