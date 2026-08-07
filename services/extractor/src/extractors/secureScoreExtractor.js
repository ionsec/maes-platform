const BaseExtractor = require('./baseExtractor');

/**
 * Tier 1 native Graph extractor for Microsoft Secure Score.
 *
 * Endpoint: GET /security/secureScores (list of per-tenant scores,
 * ordered newest-first). Mirrors the upstream Get-SecureScore cmdlet.
 */
class SecureScoreExtractor extends BaseExtractor {
  async extract(parameters) {
    const data = await this.graphClient.getAllPages('/security/secureScores', {
      select: [
        'id',
        'azureTenantId',
        'activeUserCount',
        'enabledServices',
        'licenseNames',
        'createdDateTime',
        'licensedUserCount',
        'currentScore',
        'maxScore',
        'averageComparativeScores',
        'controlScores'
      ]
    });

    await this.progressTracker.updatePhase('writing');
    // Normalize single-value responses into an array for consistent output
    const records = Array.isArray(data) ? data : (data ? [data] : []);
    return [await this.writeJson('Secure_Score.json', records)];
  }
}

module.exports = SecureScoreExtractor;
