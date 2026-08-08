const ctx = require('./context');
const ca = require('./caUtils');
const { logger } = require('../../logger');

/**
 * MFA coverage checkers (MAES-MFA-*).
 */

/**
 * Methods that resist an adversary-in-the-middle phishing proxy. SMS, voice and
 * push notification are deliberately excluded: they authenticate the user but
 * not the destination, so a relay can harvest and replay them.
 */
const PHISHING_RESISTANT_METHODS = new Set([
  'fido2securitykey',
  'passkeydeviceboundauthenticator',
  'passkeydeviceboundwindowshello',
  'windowshelloforbusiness',
  'x509certificatesinglefactor',
  'x509certificatemultifactor',
  'certificate'
]);

/** Directory roles treated as privileged for the purposes of MAES-MFA-02. */
const PRIVILEGED_ROLE_NAMES = new Set([
  'global administrator',
  'privileged role administrator',
  'privileged authentication administrator',
  'security administrator',
  'exchange administrator',
  'sharepoint administrator',
  'user administrator',
  'application administrator',
  'cloud application administrator',
  'authentication administrator',
  'conditional access administrator',
  'intune administrator',
  'hybrid identity administrator',
  'helpdesk administrator',
  'billing administrator'
]);

function normaliseMethod(method) {
  return String(method).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Index the registration report by user id and by UPN. */
async function getRegistrationIndex(graphClient) {
  return ctx.memo(graphClient, 'registrationIndex', async () => {
    const details = await ctx.getUserRegistrationDetails(graphClient);
    const byId = new Map();
    const byUpn = new Map();

    for (const d of details) {
      if (d.id) byId.set(d.id, d);
      if (d.userPrincipalName) byUpn.set(d.userPrincipalName.toLowerCase(), d);
    }

    return { details, byId, byUpn };
  });
}

/** MAES-MFA-01: every enabled user has registered a strong authentication method. */
async function checkMfaRegistrationCoverage(graphClient) {
  const [users, index] = await Promise.all([
    ctx.getEnabledUsers(graphClient),
    getRegistrationIndex(graphClient)
  ]);

  const members = users.filter(u => u.userType !== 'Guest');

  const failingEntities = [];
  let registered = 0;
  let unknown = 0;

  for (const user of members) {
    const detail = index.byId.get(user.id)
      || (user.userPrincipalName ? index.byUpn.get(user.userPrincipalName.toLowerCase()) : null);

    if (!detail) {
      // The report lags directory changes; a very new account may not appear yet.
      unknown++;
      failingEntities.push({
        type: 'User',
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        reason: 'No entry in the authentication method registration report'
      });
      continue;
    }

    if (detail.isMfaRegistered) {
      registered++;
    } else {
      failingEntities.push({
        type: 'User',
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        reason: 'No multi-factor authentication method registered',
        methodsRegistered: detail.methodsRegistered || []
      });
    }
  }

  const total = members.length;
  if (total === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { enabledMemberUsers: 0 },
      evidence: { reason: 'No enabled member users found' }
    };
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round((registered / total) * 100),
    actualResult: {
      enabledMemberUsers: total,
      mfaRegistered: registered,
      notRegistered: failingEntities.length - unknown,
      missingFromReport: unknown,
      coverageRate: Math.round((registered / total) * 100)
    },
    evidence: { failingEntities },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} of ${total} enabled users have no registered MFA method. `
        + 'Enforce registration through the Entra ID MFA registration policy or a Conditional Access policy '
        + 'targeting the "Register security information" user action. Unregistered accounts are also exposed to '
        + 'MFA registration hijacking, where an attacker with the password enrols their own authenticator.'
  };
}

/** MAES-MFA-02: privileged role holders have a phishing-resistant method. */
async function checkPrivilegedPhishingResistant(graphClient) {
  const [roles, index] = await Promise.all([
    ctx.getDirectoryRolesWithMembers(graphClient),
    getRegistrationIndex(graphClient)
  ]);

  const privilegedRoles = roles.filter(r =>
    PRIVILEGED_ROLE_NAMES.has(String(r.displayName || '').toLowerCase()));

  // A user can hold several roles; report each once with all their roles.
  const holders = new Map();
  for (const role of privilegedRoles) {
    for (const member of role.members || []) {
      // Role members can be groups or service principals; only users register methods.
      if (member['@odata.type'] && !member['@odata.type'].includes('user')) continue;

      const existing = holders.get(member.id);
      if (existing) {
        existing.roles.push(role.displayName);
      } else {
        holders.set(member.id, {
          id: member.id,
          displayName: member.displayName,
          userPrincipalName: member.userPrincipalName,
          roles: [role.displayName]
        });
      }
    }
  }

  if (holders.size === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { privilegedRoleHolders: 0 },
      evidence: {
        reason: 'No user members found in privileged directory roles',
        rolesInspected: privilegedRoles.map(r => r.displayName)
      }
    };
  }

  const failingEntities = [];
  let compliantHolders = 0;

  for (const holder of holders.values()) {
    const detail = index.byId.get(holder.id)
      || (holder.userPrincipalName ? index.byUpn.get(holder.userPrincipalName.toLowerCase()) : null);

    const methods = (detail?.methodsRegistered || []).map(normaliseMethod);
    const hasPhishingResistant = methods.some(m => PHISHING_RESISTANT_METHODS.has(m));

    if (hasPhishingResistant) {
      compliantHolders++;
    } else {
      failingEntities.push({
        type: 'User',
        id: holder.id,
        displayName: holder.displayName,
        userPrincipalName: holder.userPrincipalName,
        reason: detail
          ? 'No phishing-resistant authentication method registered'
          : 'No entry in the authentication method registration report',
        roles: holder.roles,
        methodsRegistered: detail?.methodsRegistered || []
      });
    }
  }

  const total = holders.size;
  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round((compliantHolders / total) * 100),
    actualResult: {
      privilegedRoleHolders: total,
      withPhishingResistant: compliantHolders,
      withoutPhishingResistant: failingEntities.length,
      rolesInspected: privilegedRoles.map(r => r.displayName)
    },
    evidence: { failingEntities },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} of ${total} privileged role holders have no phishing-resistant method registered. `
        + 'Register FIDO2 security keys, Windows Hello for Business, or certificate-based authentication for these '
        + 'accounts and enforce them with a Conditional Access authentication strength policy scoped to directory '
        + 'roles. SMS, voice and push approval do not resist an adversary-in-the-middle proxy.'
  };
}

/** MAES-MFA-03: no enabled user falls outside every MFA-enforcing policy. */
async function checkMfaPolicyCoverage(graphClient) {
  const [policies, users] = await Promise.all([
    ctx.getConditionalAccessPolicies(graphClient),
    ctx.getEnabledUsers(graphClient)
  ]);

  const enforcing = ca.mfaEnforcingPolicies(policies);
  const members = users.filter(u => u.userType !== 'Guest');

  if (members.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { enabledMemberUsers: 0 },
      evidence: { reason: 'No enabled member users found' }
    };
  }

  // With no enforcing policy at all, every user is uncovered.
  if (enforcing.length === 0) {
    return {
      status: 'non_compliant',
      score: 0,
      actualResult: {
        enabledMemberUsers: members.length,
        mfaEnforcingPolicies: 0,
        usersOutsideAllMfaPolicies: members.length
      },
      evidence: {
        failingEntities: [{
          type: 'Tenant',
          id: 'mfa-coverage',
          displayName: 'Multi-factor authentication enforcement',
          reason: 'No enabled Conditional Access policy requires MFA across all cloud apps'
        }],
        policies: policies.map(p => ({ id: p.id, displayName: p.displayName, state: p.state }))
      },
      remediationGuidance: 'No enabled Conditional Access policy requires multi-factor authentication for all '
        + 'cloud apps. Create one targeting all users and all cloud apps, validating it in report-only mode '
        + 'first, then move it to enabled.'
    };
  }

  // Policies scoped to 'All' users are the ones that can provide blanket
  // coverage; for those, the gap is precisely their exclusion set.
  const blanketPolicies = enforcing.filter(p => ca.targetsAllUsers(p));

  if (blanketPolicies.length === 0) {
    return {
      status: 'manual_review',
      score: 0,
      actualResult: {
        enabledMemberUsers: members.length,
        mfaEnforcingPolicies: enforcing.length,
        blanketPolicies: 0
      },
      evidence: {
        reason: 'MFA-enforcing policies exist but none targets all users; per-group scope resolution is required '
          + 'to determine coverage and is not evaluated automatically.',
        policies: enforcing.map(p => ({
          id: p.id,
          displayName: p.displayName,
          includeUsers: p.conditions?.users?.includeUsers || [],
          includeGroups: p.conditions?.users?.includeGroups || [],
          includeRoles: p.conditions?.users?.includeRoles || []
        }))
      },
      remediationGuidance: 'MFA is enforced only for specific users, groups or roles. Review whether the combined '
        + 'scope of these policies covers every enabled user, or replace them with a single policy targeting all '
        + 'users with documented exclusions.'
    };
  }

  // Resolve excluded principals for each blanket policy. A user is uncovered
  // only if excluded from every one of them.
  const usersById = new Map(members.map(u => [u.id, u]));
  const perPolicyExcluded = [];

  for (const policy of blanketPolicies) {
    const excluded = new Set(ca.exclusions(policy).users);

    for (const groupId of ca.exclusions(policy).groups) {
      try {
        const groupMembers = await ctx.getAll(graphClient, `/groups/${groupId}/members`, {
          select: ['id', 'displayName', 'userPrincipalName'],
          top: 999
        });
        groupMembers.forEach(m => excluded.add(m.id));
      } catch (error) {
        logger.warn(`Could not resolve excluded group ${groupId} for policy ${policy.id}: ${error.message}`);
      }
    }

    perPolicyExcluded.push({ policy, excluded });
  }

  const uncovered = [];
  for (const [userId, user] of usersById.entries()) {
    const excludedEverywhere = perPolicyExcluded.every(({ excluded }) => excluded.has(userId));
    if (excludedEverywhere) {
      uncovered.push({
        type: 'User',
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        reason: 'Excluded from every MFA-enforcing Conditional Access policy',
        excludedFrom: perPolicyExcluded
          .filter(({ excluded }) => excluded.has(userId))
          .map(({ policy }) => policy.displayName)
      });
    }
  }

  // Roles excluded from a blanket policy are reported separately: role
  // membership is dynamic, so the specific users cannot be enumerated reliably.
  const excludedRoles = blanketPolicies.flatMap(p =>
    ca.exclusions(p).roles.map(roleId => ({
      type: 'DirectoryRole',
      id: roleId,
      displayName: `Role ${roleId}`,
      reason: `Directory role excluded from MFA-enforcing policy '${p.displayName}'`
    })));

  const failingEntities = [...uncovered, ...excludedRoles];
  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round(((members.length - uncovered.length) / members.length) * 100),
    actualResult: {
      enabledMemberUsers: members.length,
      mfaEnforcingPolicies: enforcing.length,
      blanketPolicies: blanketPolicies.length,
      usersOutsideAllMfaPolicies: uncovered.length,
      excludedDirectoryRoles: excludedRoles.length
    },
    evidence: {
      failingEntities,
      policies: blanketPolicies.map(p => ({
        id: p.id,
        displayName: p.displayName,
        exclusions: ca.exclusions(p)
      }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${uncovered.length} enabled user(s) and ${excludedRoles.length} directory role exclusion(s) fall outside `
        + 'every MFA-enforcing policy. Review each exclusion, remove those that are stale, and replace standing '
        + 'exclusions with time-limited ones that have a named owner and a compensating control.'
  };
}

module.exports = {
  'MAES-MFA-01': checkMfaRegistrationCoverage,
  'MAES-MFA-02': checkPrivilegedPhishingResistant,
  'MAES-MFA-03': checkMfaPolicyCoverage,
  // exported for tests
  PHISHING_RESISTANT_METHODS,
  PRIVILEGED_ROLE_NAMES
};
