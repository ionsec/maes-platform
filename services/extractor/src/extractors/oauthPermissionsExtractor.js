const BaseExtractor = require('./baseExtractor');

class OauthPermissionsExtractor extends BaseExtractor {
  async extract(parameters) {
    // Fetch service principals, OAuth2 grants, and app role assignments
    const [servicePrincipals, oauth2Grants] = await Promise.all([
      this.graphClient.getAllPages('/servicePrincipals', {
        select: ['id', 'appId', 'displayName', 'servicePrincipalType', 'appOwnerOrganizationId',
          'publishedPermissionGrants', 'signInAudience', 'appRoles', 'oauth2PermissionScopes'],
        top: 500
      }),
      this.graphClient.getAllPages('/oauth2PermissionGrants', { top: 500 })
    ]);

    // Enrich with app role assignments for each service principal (limit to first 200 to avoid flooding)
    const spsWithRoles = [];
    for (const sp of servicePrincipals.slice(0, 200)) {
      try {
        const assignments = await this.graphClient.getAllPages(
          `/servicePrincipals/${sp.id}/appRoleAssignments`,
          { top: 100 }
        );
        spsWithRoles.push({ ...sp, appRoleAssignments: assignments });
      } catch {
        spsWithRoles.push(sp);
      }
    }

    await this.progressTracker.updatePhase('writing');

    return [
      await this.writeJson('OAuth_ServicePrincipals.json', spsWithRoles),
      await this.writeJson('OAuth_PermissionGrants.json', oauth2Grants)
    ];
  }
}

module.exports = OauthPermissionsExtractor;