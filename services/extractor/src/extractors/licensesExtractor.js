const BaseExtractor = require('./baseExtractor');

class LicensesExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/subscribedSkus', {
      select: ['id', 'skuId', 'skuPartNumber', 'capabilityStatus', 'appliesTo',
        'prepaidUnits', 'consumedUnits', 'servicePlans'],
      top: 500
    });

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('Licenses_SubscribedSkus.json', data)];
  }
}

module.exports = LicensesExtractor;