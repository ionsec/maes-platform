const ctx = require('./context');
const { logger } = require('../../logger');

/**
 * Federation posture checkers (MAES-FED-*).
 *
 * FED-02 and FED-03 probe the tenant's own AD FS host, discovered through the
 * unauthenticated user-realm endpoint. They issue a small, fixed number of
 * read-only GETs against infrastructure the assessed organisation operates.
 */

/** MAES-FED-01: inventory federated domains. */
async function checkFederatedDomains(graphClient) {
  const domains = await ctx.getDomains(graphClient);
  const federated = domains.filter(d => d.authenticationType === 'Federated');

  const failingEntities = federated.map(d => ({
    type: 'Domain',
    id: d.id,
    displayName: d.id,
    reason: 'Domain is federated to an external identity provider',
    isDefault: d.isDefault === true,
    isInitial: d.isInitial === true
  }));

  const isCompliant = federated.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      totalDomains: domains.length,
      federatedDomains: federated.length,
      managedDomains: domains.length - federated.length
    },
    evidence: {
      failingEntities,
      domains: domains.map(d => ({
        name: d.id,
        authenticationType: d.authenticationType,
        isDefault: d.isDefault === true,
        isInitial: d.isInitial === true
      }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${federated.length} domain(s) are federated: ${federated.map(d => d.id).join(', ')}. `
        + 'Confirm the federation is still required and treat the federation servers as tier-0 infrastructure. '
        + 'Where it is no longer required, convert the domain to managed authentication.'
  };
}

/**
 * Probe the AD FS hosts backing federated domains.
 * Shared by FED-02 and FED-03 so the host lookup happens once per assessment.
 */
async function getFederationProbes(graphClient) {
  return ctx.memo(graphClient, 'federationProbes', async () => {
    const federated = await ctx.getFederatedDomains(graphClient);
    const results = [];

    // De-duplicate: several domains commonly share one AD FS farm.
    const hostsByDomain = new Map();
    for (const domain of federated) {
      const host = await ctx.getFederationHost(domain.id);
      if (host) hostsByDomain.set(host, [...(hostsByDomain.get(host) || []), domain.id]);
    }

    for (const [host, domainNames] of hostsByDomain.entries()) {
      logger.debug(`Probing federation host ${host} for domains: ${domainNames.join(', ')}`);
      const [usernameMixed, windowsTransport, mex] = await Promise.all([
        ctx.probe(`https://${host}/adfs/services/trust/2005/usernamemixed`),
        ctx.probe(`https://${host}/adfs/services/trust/2005/windowstransport`),
        ctx.probe(`https://${host}/adfs/services/trust/mex`)
      ]);

      results.push({ host, domains: domainNames, usernameMixed, windowsTransport, mex });
    }

    return results;
  });
}

/**
 * An endpoint counts as exposed when it answers with a real HTTP status rather
 * than refusing the connection. 404 means AD FS is present but the endpoint is
 * disabled or not published, so it is not treated as exposed.
 */
function isExposed(probeResult) {
  return probeResult.reachable
    && probeResult.statusCode !== null
    && probeResult.statusCode !== 404;
}

/** MAES-FED-02: AD FS WS-Trust endpoints reachable. */
async function checkWsTrustEndpoints(graphClient) {
  const probes = await getFederationProbes(graphClient);

  if (probes.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { federationHosts: 0 },
      evidence: { reason: 'No federated domains with a resolvable federation host' }
    };
  }

  const failingEntities = [];
  for (const p of probes) {
    if (isExposed(p.usernameMixed)) {
      failingEntities.push({
        type: 'Endpoint',
        id: p.usernameMixed.url,
        displayName: `${p.host} (usernamemixed)`,
        reason: `WS-Trust usernamemixed endpoint responded with HTTP ${p.usernameMixed.statusCode}`,
        domains: p.domains
      });
    }
    if (isExposed(p.windowsTransport)) {
      failingEntities.push({
        type: 'Endpoint',
        id: p.windowsTransport.url,
        displayName: `${p.host} (windowstransport)`,
        reason: `WS-Trust windowstransport endpoint responded with HTTP ${p.windowsTransport.statusCode}`,
        domains: p.domains
      });
    }
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      federationHosts: probes.length,
      exposedEndpoints: failingEntities.length
    },
    evidence: {
      failingEntities,
      probes: probes.map(p => ({
        host: p.host,
        domains: p.domains,
        usernameMixed: p.usernameMixed,
        windowsTransport: p.windowsTransport
      }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} WS-Trust endpoint(s) are reachable from the internet. `
        + 'Disable the WS-Trust 1.3/2005 username-mixed and Windows-transport endpoints for extranet access '
        + 'in the AD FS management console, or block them at the Web Application Proxy. '
        + 'These endpoints accept passwords without applying Entra ID Conditional Access or MFA.'
  };
}

/** MAES-FED-03: AD FS MEX endpoint exposed. */
async function checkMexEndpoint(graphClient) {
  const probes = await getFederationProbes(graphClient);

  if (probes.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { federationHosts: 0 },
      evidence: { reason: 'No federated domains with a resolvable federation host' }
    };
  }

  const failingEntities = probes
    .filter(p => isExposed(p.mex))
    .map(p => ({
      type: 'Endpoint',
      id: p.mex.url,
      displayName: `${p.host} (mex)`,
      reason: `Metadata exchange endpoint responded with HTTP ${p.mex.statusCode}`,
      domains: p.domains
    }));

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      federationHosts: probes.length,
      exposedMexEndpoints: failingEntities.length
    },
    evidence: {
      failingEntities,
      probes: probes.map(p => ({ host: p.host, domains: p.domains, mex: p.mex }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} AD FS metadata exchange endpoint(s) are publicly reachable. `
        + 'Restrict /adfs/services/trust/mex to internal networks at the Web Application Proxy so that '
        + 'the relying-party and trust configuration cannot be enumerated anonymously.'
  };
}

module.exports = {
  'MAES-FED-01': checkFederatedDomains,
  'MAES-FED-02': checkWsTrustEndpoints,
  'MAES-FED-03': checkMexEndpoint
};
