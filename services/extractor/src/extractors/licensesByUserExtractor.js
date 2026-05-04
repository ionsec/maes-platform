const BaseExtractor = require('./baseExtractor');

class LicensesByUserExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/users', {
      select: ['id', 'displayName', 'userPrincipalName', 'assignedLicenses', 'licenseAssignmentStates'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Licenses_ByUser.json', data)];
  }
}

module.exports = LicensesByUserExtractor;