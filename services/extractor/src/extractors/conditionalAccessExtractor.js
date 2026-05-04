const BaseExtractor = require('./baseExtractor');

class ConditionalAccessExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/identity/conditionalAccess/policies', {
      select: ['id', 'displayName', 'createdDateTime', 'modifiedDateTime', 'state',
        'conditions', 'grantControls', 'sessionControls'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('ConditionalAccess_Policies.json', data)];
  }
}

module.exports = ConditionalAccessExtractor;