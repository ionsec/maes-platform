const BaseExtractor = require('./baseExtractor');

class LicenseCompatibilityExtractor extends BaseExtractor {
  async extract(parameters) {
    // Get subscribed SKUs and derive compatibility/service plan overlap
    const skus = await this.graphClient.getAllPages('/subscribedSkus', {
      select: ['skuId', 'skuPartNumber', 'servicePlans', 'prepaidUnits', 'consumedUnits'],
      top: 500
    });

    // Build a service plan cross-reference
    const servicePlanIndex = {};
    for (const sku of skus) {
      for (const plan of (sku.servicePlans || [])) {
        if (!servicePlanIndex[plan.servicePlanId]) {
          servicePlanIndex[plan.servicePlanId] = { name: plan.servicePlanName, skus: [] };
        }
        servicePlanIndex[plan.servicePlanId].skus.push(sku.skuPartNumber);
      }
    }

    await this.progressTracker.updatePhase('writing');
    return [await this.writeJson('License_Compatibility.json', skus, { servicePlanIndex })];
  }
}

module.exports = LicenseCompatibilityExtractor;