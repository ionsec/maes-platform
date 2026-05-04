const BaseExtractor = require('./baseExtractor');

class RiskyDetectionsExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/identityProtection/riskyDetections', {
      select: ['id', 'requestId', 'correlationId', 'riskEventType', 'riskState',
        'riskLevel', 'riskDetail', 'ipAddress', 'activityDateTime',
        'detectedDateTime', 'lastUpdatedDateTime', 'userId', 'userDisplayName', 'userPrincipalName'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('RiskyDetections.json', data)];
  }
}

module.exports = RiskyDetectionsExtractor;