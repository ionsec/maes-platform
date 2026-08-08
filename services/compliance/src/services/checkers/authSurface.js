const ctx = require('./context');
const ca = require('./caUtils');

/**
 * Authentication surface checkers (MAES-AUTH-*).
 *
 * Both controls evaluate Conditional Access configuration rather than
 * attempting a live authentication, so they never send credentials anywhere.
 */

function summarisePolicy(policy) {
  return {
    id: policy.id,
    displayName: policy.displayName,
    state: policy.state,
    clientAppTypes: ca.clientAppTypes(policy),
    grantControls: ca.grantControls(policy),
    targetsAllUsers: ca.targetsAllUsers(policy),
    targetsAllApps: ca.targetsAllApps(policy),
    exclusionCount: ca.exclusionCount(policy)
  };
}

/** MAES-AUTH-01: ROPC / password grant blocked. */
async function checkRopcBlocked(graphClient) {
  const policies = await ctx.getConditionalAccessPolicies(graphClient);

  // ROPC arrives as the 'other' client app type. A blocking policy covering
  // 'other' for all users and all apps is what shuts the flow down.
  const blockingPolicies = policies.filter(p =>
    ca.isEnabled(p)
    && ca.isBlockPolicy(p)
    && ca.targetsOtherClients(p)
    && ca.targetsAllUsers(p)
    && ca.targetsAllApps(p));

  // Policies that would block ROPC but are not currently enforcing.
  const nearMisses = policies.filter(p =>
    !ca.isEnabled(p)
    && ca.isBlockPolicy(p)
    && ca.targetsOtherClients(p));

  const isCompliant = blockingPolicies.length > 0;

  const failingEntities = isCompliant ? [] : nearMisses.map(p => ({
    type: 'ConditionalAccessPolicy',
    id: p.id,
    displayName: p.displayName,
    reason: `Policy would block ROPC but is in '${p.state}' state`
  }));

  if (!isCompliant && nearMisses.length === 0) {
    failingEntities.push({
      type: 'Tenant',
      id: 'ropc',
      displayName: 'Resource owner password credentials flow',
      reason: 'No enabled Conditional Access policy blocks the "other clients" app type for all users and all apps'
    });
  }

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      totalPolicies: policies.length,
      blockingPolicies: blockingPolicies.length,
      policiesNotEnforcing: nearMisses.length
    },
    evidence: {
      failingEntities,
      blockingPolicies: blockingPolicies.map(summarisePolicy),
      candidatePolicies: nearMisses.map(summarisePolicy)
    },
    remediationGuidance: isCompliant
      ? null
      : 'Create (or enable) a Conditional Access policy that blocks the "Other clients" app type for all users '
        + 'and all cloud apps. ROPC sends a password straight to the token endpoint and cannot present an MFA '
        + 'challenge, so any application relying on it should be migrated to the authorization code or client '
        + 'credentials flow first.'
  };
}

/** MAES-AUTH-02: legacy authentication blocked tenant-wide. */
async function checkLegacyAuthBlocked(graphClient) {
  const policies = await ctx.getConditionalAccessPolicies(graphClient);

  const blockingPolicies = policies.filter(p =>
    ca.isEnabled(p)
    && ca.isBlockPolicy(p)
    && ca.targetsLegacyClients(p)
    && ca.targetsAllUsers(p)
    && ca.targetsAllApps(p));

  const nearMisses = policies.filter(p =>
    !ca.isEnabled(p)
    && ca.isBlockPolicy(p)
    && ca.targetsLegacyClients(p));

  const isCompliant = blockingPolicies.length > 0;

  // Even a compliant policy leaves a gap if it carries standing exclusions.
  const excludedFromBlock = blockingPolicies.reduce((sum, p) => sum + ca.exclusionCount(p), 0);

  const failingEntities = [];
  if (!isCompliant) {
    if (nearMisses.length > 0) {
      failingEntities.push(...nearMisses.map(p => ({
        type: 'ConditionalAccessPolicy',
        id: p.id,
        displayName: p.displayName,
        reason: `Policy would block legacy authentication but is in '${p.state}' state`
      })));
    } else {
      failingEntities.push({
        type: 'Tenant',
        id: 'legacy-auth',
        displayName: 'Legacy authentication',
        reason: 'No enabled Conditional Access policy blocks legacy authentication clients for all users and all apps'
      });
    }
  }

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      totalPolicies: policies.length,
      blockingPolicies: blockingPolicies.length,
      policiesNotEnforcing: nearMisses.length,
      principalsExcludedFromBlock: excludedFromBlock
    },
    evidence: {
      failingEntities,
      blockingPolicies: blockingPolicies.map(summarisePolicy),
      candidatePolicies: nearMisses.map(summarisePolicy),
      note: excludedFromBlock > 0
        ? `${excludedFromBlock} principal(s) are excluded from the blocking policy and can still use legacy authentication. See MAES-CA-02.`
        : undefined
    },
    remediationGuidance: isCompliant
      ? null
      : 'Deploy an enabled Conditional Access policy blocking legacy authentication clients (Exchange ActiveSync '
        + 'and other clients) for all users and all cloud apps. Inventory older Outlook clients, scanners and '
        + 'line-of-business applications first, and give any that genuinely cannot be migrated a scoped, '
        + 'time-limited exclusion rather than leaving the policy off.'
  };
}

module.exports = {
  'MAES-AUTH-01': checkRopcBlocked,
  'MAES-AUTH-02': checkLegacyAuthBlocked
};
