const ctx = require('./context');
const ca = require('./caUtils');

/**
 * Conditional Access hygiene checkers (MAES-CA-*).
 */

/** Recommended ceiling on emergency access accounts. */
const MAX_BREAK_GLASS_ACCOUNTS = 2;

/** MAES-CA-01: policies are not parked in report-only or disabled state. */
async function checkPolicyStates(graphClient) {
  const policies = await ctx.getConditionalAccessPolicies(graphClient);

  if (policies.length === 0) {
    return {
      status: 'non_compliant',
      score: 0,
      actualResult: { totalPolicies: 0 },
      evidence: {
        failingEntities: [{
          type: 'Tenant',
          id: 'conditional-access',
          displayName: 'Conditional Access',
          reason: 'No Conditional Access policies are configured'
        }]
      },
      remediationGuidance: 'The tenant has no Conditional Access policies. Without them, no access conditions are '
        + 'enforced beyond the default sign-in requirements. Start with policies requiring MFA for all users and '
        + 'blocking legacy authentication.'
    };
  }

  const byState = {
    enabled: policies.filter(p => p.state === 'enabled'),
    reportOnly: policies.filter(p => p.state === 'enabledForReportingButNotEnforced'),
    disabled: policies.filter(p => p.state === 'disabled')
  };

  const failingEntities = [
    ...byState.reportOnly.map(p => ({
      type: 'ConditionalAccessPolicy',
      id: p.id,
      displayName: p.displayName,
      reason: 'Policy is in report-only state and enforces nothing',
      createdDateTime: p.createdDateTime,
      modifiedDateTime: p.modifiedDateTime
    })),
    ...byState.disabled.map(p => ({
      type: 'ConditionalAccessPolicy',
      id: p.id,
      displayName: p.displayName,
      reason: 'Policy is disabled and enforces nothing',
      createdDateTime: p.createdDateTime,
      modifiedDateTime: p.modifiedDateTime
    }))
  ];

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round((byState.enabled.length / policies.length) * 100),
    actualResult: {
      totalPolicies: policies.length,
      enabled: byState.enabled.length,
      reportOnly: byState.reportOnly.length,
      disabled: byState.disabled.length,
      nonEnabledPolicies: failingEntities.length
    },
    evidence: {
      failingEntities,
      policies: policies.map(p => ({ id: p.id, displayName: p.displayName, state: p.state }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${byState.reportOnly.length} policy/policies are in report-only state and ${byState.disabled.length} are `
        + 'disabled. For each, review the report-only impact data and either promote it to enabled or delete it. '
        + 'Policies left in report-only give the appearance of a control that is not enforcing anything.'
  };
}

/** MAES-CA-02: excluded principals and break-glass accounts are constrained. */
async function checkExclusionInventory(graphClient) {
  const policies = await ctx.getConditionalAccessPolicies(graphClient);

  if (policies.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { totalPolicies: 0 },
      evidence: { reason: 'No Conditional Access policies configured; see MAES-CA-01' }
    };
  }

  // Build the union of excluded principals and the policies each is excluded from.
  const excludedUsers = new Map();
  const excludedGroups = new Map();
  const excludedRoles = new Map();

  const track = (map, id, policy, kind) => {
    const entry = map.get(id) || { id, kind, policies: [] };
    entry.policies.push({ id: policy.id, displayName: policy.displayName, state: policy.state });
    map.set(id, entry);
  };

  for (const policy of policies) {
    const e = ca.exclusions(policy);
    e.users.forEach(id => track(excludedUsers, id, policy, 'User'));
    e.groups.forEach(id => track(excludedGroups, id, policy, 'Group'));
    e.roles.forEach(id => track(excludedRoles, id, policy, 'DirectoryRole'));
  }

  // Resolve excluded user identities so the report names accounts rather than GUIDs.
  const resolvedUsers = [];
  for (const entry of excludedUsers.values()) {
    try {
      // Single resource, not a collection, so go through .api() directly
      // rather than the paging helper.
      const user = await graphClient.api(`/users/${entry.id}`)
        .select('id,displayName,userPrincipalName,accountEnabled')
        .get();
      resolvedUsers.push({ ...entry, ...(user || {}) });
    } catch (error) {
      resolvedUsers.push({ ...entry, displayName: `Unresolved user ${entry.id}`, resolutionError: error.message });
    }
  }

  // Users excluded from every single policy are the likely break-glass accounts.
  const totalPolicies = policies.length;
  const likelyBreakGlass = resolvedUsers.filter(u => u.policies.length === totalPolicies);
  const otherExclusions = resolvedUsers.filter(u => u.policies.length < totalPolicies);

  const failingEntities = [];

  if (likelyBreakGlass.length > MAX_BREAK_GLASS_ACCOUNTS) {
    failingEntities.push(...likelyBreakGlass.map(u => ({
      type: 'User',
      id: u.id,
      displayName: u.displayName,
      userPrincipalName: u.userPrincipalName,
      reason: `Excluded from all ${totalPolicies} Conditional Access policies; more than the recommended `
        + `maximum of ${MAX_BREAK_GLASS_ACCOUNTS} such accounts exist`
    })));
  }

  failingEntities.push(...otherExclusions.map(u => ({
    type: 'User',
    id: u.id,
    displayName: u.displayName,
    userPrincipalName: u.userPrincipalName,
    reason: `Excluded from ${u.policies.length} of ${totalPolicies} Conditional Access policies`,
    excludedFrom: u.policies.map(p => p.displayName)
  })));

  failingEntities.push(...[...excludedGroups.values()].map(g => ({
    type: 'Group',
    id: g.id,
    displayName: `Group ${g.id}`,
    reason: `Group excluded from ${g.policies.length} Conditional Access policy/policies`,
    excludedFrom: g.policies.map(p => p.displayName)
  })));

  failingEntities.push(...[...excludedRoles.values()].map(r => ({
    type: 'DirectoryRole',
    id: r.id,
    displayName: `Role ${r.id}`,
    reason: `Directory role excluded from ${r.policies.length} Conditional Access policy/policies`,
    excludedFrom: r.policies.map(p => p.displayName)
  })));

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      totalPolicies,
      excludedUsers: excludedUsers.size,
      excludedGroups: excludedGroups.size,
      excludedRoles: excludedRoles.size,
      likelyBreakGlassAccounts: likelyBreakGlass.length,
      maxRecommendedBreakGlassAccounts: MAX_BREAK_GLASS_ACCOUNTS
    },
    evidence: {
      failingEntities,
      likelyBreakGlassAccounts: likelyBreakGlass.map(u => ({
        id: u.id,
        displayName: u.displayName,
        userPrincipalName: u.userPrincipalName,
        accountEnabled: u.accountEnabled
      }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} principal(s) are excluded from one or more Conditional Access policies. `
        + `Keep no more than ${MAX_BREAK_GLASS_ACCOUNTS} cloud-only break-glass accounts, protect them with FIDO2 `
        + 'keys or escrowed passphrases, and alert on every sign-in they perform. Every other exclusion should be '
        + 'documented with an owner and an expiry, or removed.'
  };
}

module.exports = {
  'MAES-CA-01': checkPolicyStates,
  'MAES-CA-02': checkExclusionInventory
};
