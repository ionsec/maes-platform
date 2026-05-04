const BaseExtractor = require('./baseExtractor');

class RoleActivityExtractor extends BaseExtractor {
  async extract(parameters) {
    const [directoryRoles, transitiveAssignments] = await Promise.all([
      this.graphClient.getAllPages('/directoryRoles', {
        select: ['id', 'displayName', 'description', 'roleTemplateId'],
        top: 500
      }),
      this.graphClient.getAllPages('/roleManagement/directory/transitiveRoleAssignments', {
        select: ['id', 'principalId', 'roleDefinitionId', 'directoryScopeId', 'appScopeId'],
        top: 500
      })
    ]);

    // Enrich directory roles with members
    const rolesWithMembers = [];
    for (const role of directoryRoles.slice(0, 100)) {
      try {
        const members = await this.graphClient.getAllPages(
          `/directoryRoles/${role.id}/members`,
          { select: ['id', 'displayName', 'userPrincipalName'], top: 500 }
        );
        rolesWithMembers.push({ ...role, members });
      } catch {
        rolesWithMembers.push(role);
      }
    }

    await this.progressTracker.updatePhase('writing');

    return [
      await this.writeJson('DirectoryRoles_Members.json', rolesWithMembers),
      await this.writeJson('RoleTransitiveAssignments.json', transitiveAssignments)
    ];
  }
}

module.exports = RoleActivityExtractor;