const BaseExtractor = require('./baseExtractor');

class UalGraphExtractor extends BaseExtractor {
  async extract(parameters) {
    const { startDate, endDate } = parameters;
    const filter = [];
    if (startDate) filter.push(`activityDateTime ge ${startDate}T00:00:00Z`);
    if (endDate) filter.push(`activityDateTime le ${endDate}T23:59:59Z`);

    const options = {
      select: ['id', 'category', 'correlationId', 'result', 'resultReason',
        'activityDisplayName', 'activityDateTime', 'loggedByService',
        'initiatedBy', 'targetResources', 'additionalDetails'],
      top: 500,
      orderby: 'activityDateTime desc'
    };
    if (filter.length > 0) options.filter = filter.join(' and ');

    const data = await this.graphClient.getAllPages('/auditLogs/directoryAudits', options);
    await this.progressTracker.updatePhase('writing');

    return [await this.writeJson('UAL_Graph_DirectoryAudits.json', data, { startDate, endDate })];
  }
}

module.exports = UalGraphExtractor;