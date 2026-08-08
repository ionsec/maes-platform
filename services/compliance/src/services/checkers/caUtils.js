/**
 * Shared interpretation helpers for Conditional Access policy objects.
 *
 * Graph returns policy scope as include/exclude sets of user, group and role
 * IDs, with the special token 'All'. These helpers reduce that shape to the
 * questions the checkers actually ask.
 */

/** Policies that are actively enforcing (not disabled, not report-only). */
function isEnabled(policy) {
  return policy.state === 'enabled';
}

/** Does the policy target every user in the tenant? */
function targetsAllUsers(policy) {
  const include = policy.conditions?.users?.includeUsers || [];
  return include.includes('All');
}

/** Client app types the policy applies to. An empty set means "all". */
function clientAppTypes(policy) {
  const types = policy.conditions?.clientAppTypes || [];
  return types.length === 0 ? ['all'] : types;
}

/**
 * Does the policy apply to legacy authentication clients?
 * Graph models these as the 'exchangeActiveSync' and 'other' client app types.
 */
function targetsLegacyClients(policy) {
  const types = clientAppTypes(policy);
  return types.includes('exchangeActiveSync') || types.includes('other') || types.includes('all');
}

/** Does the policy specifically target the 'other' client type, which covers ROPC? */
function targetsOtherClients(policy) {
  const types = clientAppTypes(policy);
  return types.includes('other') || types.includes('all');
}

/** Built-in grant controls, lowercased. */
function grantControls(policy) {
  return (policy.grantControls?.builtInControls || []).map(c => String(c).toLowerCase());
}

/** Does the policy block access outright? */
function isBlockPolicy(policy) {
  return grantControls(policy).includes('block');
}

/** Does the policy require multi-factor authentication? */
function requiresMfa(policy) {
  const controls = grantControls(policy);
  return controls.includes('mfa')
    // An authentication strength reference is the modern equivalent of the mfa control.
    || Boolean(policy.grantControls?.authenticationStrength);
}

/** Does the policy apply to all cloud apps? */
function targetsAllApps(policy) {
  const include = policy.conditions?.applications?.includeApplications || [];
  return include.includes('All');
}

/** Everything the policy excludes, flattened for inventory purposes. */
function exclusions(policy) {
  const users = policy.conditions?.users || {};
  return {
    users: users.excludeUsers || [],
    groups: users.excludeGroups || [],
    roles: users.excludeRoles || [],
    guestsOrExternalUsers: users.excludeGuestsOrExternalUsers || null
  };
}

/** Total count of excluded principals across users, groups and roles. */
function exclusionCount(policy) {
  const e = exclusions(policy);
  return e.users.length + e.groups.length + e.roles.length;
}

/**
 * Policies that enforce MFA: enabled, requiring MFA, and covering all cloud apps.
 * A policy scoped to a single app does not provide tenant-wide MFA coverage.
 */
function mfaEnforcingPolicies(policies) {
  return policies.filter(p => isEnabled(p) && requiresMfa(p) && targetsAllApps(p));
}

module.exports = {
  isEnabled,
  targetsAllUsers,
  clientAppTypes,
  targetsLegacyClients,
  targetsOtherClients,
  grantControls,
  isBlockPolicy,
  requiresMfa,
  targetsAllApps,
  exclusions,
  exclusionCount,
  mfaEnforcingPolicies
};
