const BaseExtractor = require('./baseExtractor');

class GroupsExtractor extends BaseExtractor {
  /**
   * @param {Object} parameters
   * @param {string} parameters.type - 'groups', 'group_members', or 'dynamic_groups' (passed via dispatcher alias)
   */
  async extract(parameters, type) {
    const mode = type || 'groups';

    if (mode === 'dynamic_groups') {
      return this._extractDynamicGroups();
    }
    if (mode === 'group_members') {
      return this._extractGroupMembers();
    }
    return this._extractGroups();
  }

  async _extractGroups() {
    const data = await this.graphClient.getAllPages('/groups', {
      select: ['id', 'displayName', 'description', 'groupTypes', 'mail', 'mailNickname',
        'membershipRule', 'membershipRuleProcessingState', 'securityEnabled',
        'mailEnabled', 'visibility', 'createdDateTime', 'onPremisesSyncEnabled'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Entra_Groups.json', data)];
  }

  async _extractGroupMembers() {
    // Get all groups first, then members for each
    const groups = await this.graphClient.getAllPages('/groups', {
      select: ['id', 'displayName', 'groupTypes'],
      top: 500
    });

    const groupsWithMembers = [];
    for (const group of groups.slice(0, 200)) {
      try {
        const members = await this.graphClient.getAllPages(
          `/groups/${group.id}/transitiveMembers`,
          { select: ['id', 'displayName', 'userPrincipalName', '@odata.type'], top: 500 }
        );
        groupsWithMembers.push({ ...group, members });
      } catch {
        groupsWithMembers.push(group);
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Entra_GroupMembers.json', groupsWithMembers)];
  }

  async _extractDynamicGroups() {
    const data = await this.graphClient.getAllPages('/groups', {
      filter: "groupTypes/any(t:t eq 'DynamicMembership')",
      select: ['id', 'displayName', 'description', 'groupTypes', 'mail',
        'membershipRule', 'membershipRuleProcessingState', 'createdDateTime'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Entra_DynamicGroups.json', data)];
  }
}

module.exports = GroupsExtractor;