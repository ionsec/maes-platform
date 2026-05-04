const BaseExtractor = require('./baseExtractor');

class MfaStatusExtractor extends BaseExtractor {
  async extract(parameters) {
    // Get registration details for all users
    const data = await this.graphClient.getAllPages(
      '/reports/authenticationMethods/userRegistrationDetails',
      { top: 500 }
    );

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('MFA_Status.json', data)];
  }
}

module.exports = MfaStatusExtractor;