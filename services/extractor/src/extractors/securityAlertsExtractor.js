const BaseExtractor = require('./baseExtractor');

class SecurityAlertsExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/security/alerts_v2', {
      select: ['id', 'title', 'description', 'severity', 'status', 'classification',
        'determination', 'category', 'detectorId', 'createdDateTime', 'lastUpdateDateTime',
        'serviceSource', 'attackTechniques', 'incidentId', 'comments', 'evidence',
        'assignedTo', 'alertWebUrl'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Security_Alerts.json', data)];
  }
}

module.exports = SecurityAlertsExtractor;