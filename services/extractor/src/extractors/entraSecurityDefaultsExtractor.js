const BaseExtractor = require('./baseExtractor');

class EntraSecurityDefaultsExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getPage(
      '/policies/identitySecurityDefaultsEnforcementPolicy'
    );

    await this.progressTracker.updatePhase('writing');
    // Single policy object — wrap in array for consistent output
    const records = Array.isArray(data) ? data : [data];
    return [await this.writeJson('Entra_SecurityDefaults.json', records)];
  }
}

module.exports = EntraSecurityDefaultsExtractor;