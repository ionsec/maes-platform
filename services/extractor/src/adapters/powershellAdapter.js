const axios = require('axios');
const path = require('path');
const { logger, createExtractionLogger } = require('../logger');

const SIDECAR_URL = process.env.SIDECAR_URL || 'http://extractor-sidecar:3001';
const SIDECAR_TIMEOUT = (parseInt(process.env.POWERSHELL_TIMEOUT) || 30) * 60 * 1000;

/**
 * PowerShell adapter for Tier 3 Exchange-only extractions.
 * Calls the extractor-sidecar HTTP API instead of spawning pwsh directly.
 */
class PowerShellAdapter {
  /**
   * Check if a given extraction type requires PowerShell.
   */
  static requiresPowerShell(type) {
    const exchangeOnlyTypes = [
      'unified_audit_log',
      'admin_audit_log',
      'mailbox_audit',
      'transport_rules',
      'message_trace'
    ];
    return exchangeOnlyTypes.includes(type);
  }

  /**
   * Execute a Tier 3 extraction by calling the sidecar HTTP API.
   *
   * @param {string} type - Extraction type
   * @param {Object} parameters - Extraction parameters (startDate, endDate, etc.)
   * @param {Object} credentials - Auth credentials (applicationId, certPath, certPassword, etc.)
   * @param {string} organizationId - Organization ID
   * @param {string} extractionId - Extraction job ID
   * @returns {Object} Result with statistics
   */
  static async execute(type, parameters, credentials, organizationId, extractionId) {
    const extractionLogger = createExtractionLogger(extractionId);

    extractionLogger.info(`Calling sidecar for Tier 3 extraction: ${type}`);

    try {
      const response = await axios.post(`${SIDECAR_URL}/api/extract`, {
        type,
        parameters,
        credentials,
        organizationId,
        extractionId
      }, {
        timeout: SIDECAR_TIMEOUT,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Sidecar extraction failed');
      }

      extractionLogger.info(`Sidecar extraction ${extractionId} completed: ${response.data.statistics?.totalEvents || 0} events`);

      return {
        statistics: response.data.statistics || { totalEvents: 0, uniqueUsers: 0, uniqueOperations: 0 },
        outputFiles: [] // Sidecar writes files directly to shared volume
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Sidecar service unavailable at ${SIDECAR_URL}. Ensure extractor-sidecar is running.`);
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error(`Sidecar extraction timed out after ${SIDECAR_TIMEOUT / 1000 / 60} minutes`);
      }
      throw error;
    }
  }

  /**
   * Check if the sidecar is healthy.
   * @returns {boolean}
   */
  static async healthCheck() {
    try {
      const response = await axios.get(`${SIDECAR_URL}/health`, { timeout: 5000 });
      return response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }
}

module.exports = PowerShellAdapter;