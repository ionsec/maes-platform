const BaseExtractor = require('./baseExtractor');

class RiskyUsersExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/identityProtection/riskyUsers', {
      select: ['id', 'isDeleted', 'isProcessing', 'riskDetail', 'riskLastUpdatedDateTime',
        'riskLevel', 'riskState', 'userDisplayName', 'userPrincipalName'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('RiskyUsers.json', data)];
  }
}

module.exports = RiskyUsersExtractor;