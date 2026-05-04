const BaseExtractor = require('./baseExtractor');

class SignInLogsExtractor extends BaseExtractor {
  async extract(parameters) {
    const { startDate, endDate } = parameters;
    const filter = [];
    if (startDate) filter.push(`createdDateTime ge ${startDate}T00:00:00Z`);
    if (endDate) filter.push(`createdDateTime le ${endDate}T23:59:59Z`);

    const options = {
      select: ['id', 'appId', 'appDisplayName', 'conditionalAccessStatus', 'correlationId',
        'createdDateTime', 'riskDetail', 'riskEventTypes', 'riskLevelAggregation', 'riskState',
        'clientAppUsed', 'ipAddress', 'location', 'status', 'userDisplayName', 'userPrincipalName', 'userId'],
      top: 500,
      orderby: 'createdDateTime desc'
    };
    if (filter.length > 0) options.filter = filter.join(' and ');

    const data = await this.graphClient.getAllPages('/auditLogs/signIns', options);
    await this.progressTracker.updatePhase('writing');

    return [await this.writeJson('AzureAD_SignInLogs.json', data, { startDate, endDate })];
  }
}

module.exports = SignInLogsExtractor;