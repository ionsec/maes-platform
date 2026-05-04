const BaseExtractor = require('./baseExtractor');

class PimAssignmentsExtractor extends BaseExtractor {
  async extract(parameters) {
    const [activeAssignments, eligibleAssignments] = await Promise.all([
      this.graphClient.getAllPages('/roleManagement/directory/roleAssignmentSchedules', {
        select: ['id', 'principalId', 'roleDefinitionId', 'directoryScopeId',
          'appScopeId', 'status', 'assignmentType', 'scheduleInfo', 'createdDateTime'],
        top: 500
      }),
      this.graphClient.getAllPages('/roleManagement/directory/roleEligibilitySchedules', {
        select: ['id', 'principalId', 'roleDefinitionId', 'directoryScopeId',
          'appScopeId', 'status', 'scheduleInfo', 'createdDateTime'],
        top: 500
      })
    ]);

    await this.progressTracker.updatePhase('writing');

    return [
      await this.writeJson('PIM_ActiveAssignments.json', activeAssignments),
      await this.writeJson('PIM_EligibleAssignments.json', eligibleAssignments)
    ];
  }
}

module.exports = PimAssignmentsExtractor;