const ctx = require('./context');

/**
 * Application identity checkers (MAES-SP-*).
 */

/**
 * Microsoft Graph application permissions that confer tenant-wide privilege.
 * The first four are effectively equivalent to Global Administrator: each one
 * allows the holder to grant itself any other permission or role.
 */
const HIGH_PRIVILEGE_PERMISSIONS = new Map([
  ['RoleManagement.ReadWrite.Directory', 'Can assign directory roles, including Global Administrator, to itself'],
  ['AppRoleAssignment.ReadWrite.All', 'Can grant itself any application permission in the tenant'],
  ['Directory.ReadWrite.All', 'Can modify any directory object, including group and role membership'],
  ['PrivilegedAccess.ReadWrite.AzureADGroup', 'Can manipulate privileged access group membership'],
  ['Application.ReadWrite.All', 'Can add credentials to any application and impersonate it'],
  ['Mail.ReadWrite', 'Can read and modify mail in every mailbox in the tenant'],
  ['Mail.Read', 'Can read mail in every mailbox in the tenant'],
  ['Mail.Send', 'Can send mail as any user in the tenant'],
  ['Files.ReadWrite.All', 'Can read and modify all files in SharePoint and OneDrive'],
  ['Sites.FullControl.All', 'Has full control of every SharePoint site collection'],
  ['User.ReadWrite.All', 'Can modify any user, including resetting passwords'],
  ['Group.ReadWrite.All', 'Can modify any group, including role-assignable groups'],
  ['Policy.ReadWrite.ConditionalAccess', 'Can modify or disable Conditional Access policies'],
  ['UserAuthenticationMethod.ReadWrite.All', 'Can register authentication methods for any user']
]);

/** Default cap on how long an application credential should remain valid. */
const MAX_CREDENTIAL_LIFETIME_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** MAES-SP-01: service principals holding high-privilege application permissions. */
async function checkHighPrivilegeServicePrincipals(graphClient) {
  const servicePrincipals = await ctx.getServicePrincipals(graphClient);
  const spById = new Map(servicePrincipals.map(sp => [sp.id, sp]));

  // Resolve the Microsoft Graph service principal so app role IDs can be
  // mapped back to permission names.
  const graphSpList = await ctx.getAll(graphClient, '/servicePrincipals', {
    filter: "appId eq '00000003-0000-0000-c000-000000000000'"
  });
  const graphSp = graphSpList[0];
  const graphAppRoles = new Map((graphSp?.appRoles || []).map(r => [r.id, r.value]));

  if (!graphSp || graphAppRoles.size === 0) {
    return {
      status: 'error',
      score: 0,
      error: 'Could not resolve the Microsoft Graph service principal; application permissions cannot be evaluated'
    };
  }

  // One paged call lists every grant made against Microsoft Graph, rather than
  // a per-service-principal call across the whole tenant.
  const assignments = await ctx.getAll(
    graphClient,
    `/servicePrincipals/${graphSp.id}/appRoleAssignedTo`,
    { top: 999 }
  );

  // Group the high-privilege grants by the principal that holds them.
  const holders = new Map();
  for (const assignment of assignments) {
    const permissionName = graphAppRoles.get(assignment.appRoleId);
    if (!permissionName || !HIGH_PRIVILEGE_PERMISSIONS.has(permissionName)) continue;

    const entry = holders.get(assignment.principalId) || {
      principalId: assignment.principalId,
      principalDisplayName: assignment.principalDisplayName,
      permissions: []
    };
    entry.permissions.push({
      permission: permissionName,
      risk: HIGH_PRIVILEGE_PERMISSIONS.get(permissionName)
    });
    holders.set(assignment.principalId, entry);
  }

  const failingEntities = [...holders.values()].map((entry) => {
    const sp = spById.get(entry.principalId);
    return {
      type: 'ServicePrincipal',
      id: entry.principalId,
      displayName: sp?.displayName || entry.principalDisplayName || entry.principalId,
      appId: sp?.appId,
      servicePrincipalType: sp?.servicePrincipalType,
      accountEnabled: sp?.accountEnabled,
      appOwnerOrganizationId: sp?.appOwnerOrganizationId,
      reason: `Holds ${entry.permissions.length} high-privilege application permission(s)`,
      permissions: entry.permissions
    };
  });

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: isCompliant ? 100 : 0,
    actualResult: {
      totalServicePrincipals: servicePrincipals.length,
      highPrivilegeServicePrincipals: failingEntities.length
    },
    evidence: {
      failingEntities,
      permissionsEvaluated: [...HIGH_PRIVILEGE_PERMISSIONS.keys()]
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} service principal(s) hold tenant-wide application permissions. `
        + 'Application permissions are not subject to Conditional Access or MFA, so possession of the credential '
        + 'is sufficient to use them. Trace each grant to the functionality it supports, replace tenant-wide '
        + 'grants with scoped alternatives such as application access policies for mail, and remove grants with '
        + 'no identifiable owner.'
  };
}

/** MAES-SP-02: application credentials are current and not excessively long-lived. */
async function checkCredentialHygiene(graphClient) {
  const servicePrincipals = await ctx.getServicePrincipals(graphClient);
  const now = Date.now();

  const failingEntities = [];
  let totalCredentials = 0;
  let expiredCount = 0;
  let longLivedCount = 0;

  const inspect = (sp, credential, kind) => {
    totalCredentials++;

    const start = credential.startDateTime ? new Date(credential.startDateTime).getTime() : null;
    const end = credential.endDateTime ? new Date(credential.endDateTime).getTime() : null;
    if (!end) return;

    const problems = [];

    if (end < now) {
      expiredCount++;
      problems.push(`expired on ${new Date(end).toISOString().slice(0, 10)}`);
    }

    if (start) {
      const lifetimeDays = Math.round((end - start) / MS_PER_DAY);
      if (lifetimeDays > MAX_CREDENTIAL_LIFETIME_DAYS) {
        longLivedCount++;
        problems.push(`lifetime of ${lifetimeDays} days exceeds the ${MAX_CREDENTIAL_LIFETIME_DAYS}-day maximum`);
      }
    }

    if (problems.length > 0) {
      failingEntities.push({
        type: 'ServicePrincipalCredential',
        id: `${sp.id}:${credential.keyId || 'unknown'}`,
        displayName: `${sp.displayName} (${kind})`,
        servicePrincipalId: sp.id,
        appId: sp.appId,
        credentialType: kind,
        keyId: credential.keyId,
        displayNameHint: credential.displayName,
        startDateTime: credential.startDateTime,
        endDateTime: credential.endDateTime,
        reason: `Credential ${problems.join(' and ')}`
      });
    }
  };

  for (const sp of servicePrincipals) {
    (sp.passwordCredentials || []).forEach(c => inspect(sp, c, 'client secret'));
    (sp.keyCredentials || []).forEach(c => inspect(sp, c, 'certificate'));
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: totalCredentials === 0
      ? 100
      : Math.round(((totalCredentials - failingEntities.length) / totalCredentials) * 100),
    actualResult: {
      totalServicePrincipals: servicePrincipals.length,
      totalCredentials,
      expiredCredentials: expiredCount,
      longLivedCredentials: longLivedCount,
      maxCredentialLifetimeDays: MAX_CREDENTIAL_LIFETIME_DAYS
    },
    evidence: { failingEntities },
    remediationGuidance: isCompliant
      ? null
      : `${expiredCount} expired and ${longLivedCount} excessively long-lived application credential(s) found. `
        + 'Remove expired credentials and the abandoned registrations that hold them. Prefer certificates or '
        + 'managed identities over client secrets, and cap secret lifetime at the shortest workable interval — '
        + 'a client secret is a bearer credential with no second factor.'
  };
}

module.exports = {
  'MAES-SP-01': checkHighPrivilegeServicePrincipals,
  'MAES-SP-02': checkCredentialHygiene,
  // exported for tests
  HIGH_PRIVILEGE_PERMISSIONS,
  MAX_CREDENTIAL_LIFETIME_DAYS
};
