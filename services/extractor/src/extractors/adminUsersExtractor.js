const BaseExtractor = require('./baseExtractor');

class AdminUsersExtractor extends BaseExtractor {
  async extract(parameters) {
    // Get all directory roles, then members for each role
    const roles = await this.graphClient.getAllPages('/directoryRoles', {
      select: ['id', 'displayName', 'description', 'roleTemplateId', 'isBuiltin'],
      top: 500
    });

    const rolesWithMembers = [];
    for (const role of roles) {
      try {
        const members = await this.graphClient.getAllPages(
          `/directoryRoles/${role.id}/members`,
          { select: ['id', 'displayName', 'userPrincipalName', 'mail'], top: 500 }
        );
        rolesWithMembers.push({ ...role, members });
      } catch {
        rolesWithMembers.push(role);
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('AdminUsers_RoleMembers.json', rolesWithMembers)];
  }
}

module.exports = AdminUsersExtractor;