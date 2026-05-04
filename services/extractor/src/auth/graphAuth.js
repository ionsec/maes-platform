const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { loadPfxForAuth } = require('./certificateManager');
const { logger } = require('../logger');

class GraphAuthService {
  constructor() {
    this.clients = new Map(); // cacheKey -> { graphClient, tokenExpiry, cca }
    this.TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
  }

  /**
   * Get or create a Microsoft Graph client for an organization.
   * Uses certificate-based (client credentials) authentication via MSAL.
   *
   * @param {string} organizationId - Organization ID for caching
   * @param {Object} credentials - { tenantId, clientId, certPath, certPassword }
   * @returns {Client} Authenticated Microsoft Graph client
   */
  async getGraphClient(organizationId, credentials) {
    const { tenantId, clientId } = credentials;
    const cacheKey = `${organizationId}_${tenantId}`;

    const cached = this.clients.get(cacheKey);
    if (cached && cached.tokenExpiry > Date.now() + this.TOKEN_REFRESH_BUFFER_MS) {
      logger.debug(`Using cached Graph client for ${cacheKey}`);
      return cached.graphClient;
    }

    const certAuth = await this._loadCertificateAuth(credentials);
    const graphClient = await this._createClient(tenantId, clientId, certAuth, cacheKey);

    return graphClient;
  }

  /**
   * Test Graph API connection and key permissions.
   *
   * @param {Client} graphClient - Authenticated Graph client
   * @returns {{ success: boolean, tests: Object, successCount: number, totalTests: number, summary: string }}
   */
  async testConnection(graphClient) {
    const tests = {
      organization: { success: false, error: null },
      users: { success: false, error: null },
      policies: { success: false, error: null },
      directoryRoles: { success: false, error: null }
    };

    // Test 1: Organization info
    try {
      await graphClient.api('/organization').get();
      tests.organization.success = true;
    } catch (e) {
      tests.organization.error = e.message;
    }

    // Test 2: Users (limited)
    try {
      await graphClient.api('/users').select('id,displayName').top(1).get();
      tests.users.success = true;
    } catch (e) {
      tests.users.error = e.message;
    }

    // Test 3: Conditional access policies
    try {
      await graphClient.api('/identity/conditionalAccess/policies').get();
      tests.policies.success = true;
    } catch (e) {
      tests.policies.error = e.message;
    }

    // Test 4: Directory roles
    try {
      await graphClient.api('/directoryRoles').get();
      tests.directoryRoles.success = true;
    } catch (e) {
      tests.directoryRoles.error = e.message;
    }

    const successCount = Object.values(tests).filter(t => t.success).length;
    const overallSuccess = successCount >= 2;

    return {
      success: overallSuccess,
      tests,
      successCount,
      totalTests: Object.keys(tests).length,
      summary: overallSuccess
        ? 'Graph API connection successful with sufficient permissions'
        : 'Graph API connection has issues or insufficient permissions'
    };
  }

  /**
   * Clear cached client for an organization.
   */
  clearCache(organizationId) {
    const keysToDelete = [];
    for (const key of this.clients.keys()) {
      if (key.startsWith(organizationId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.clients.delete(key));
  }

  async _loadCertificateAuth(credentials) {
    const certPath = credentials.certPath || '/output/app.pfx';
    const certPassword = credentials.certPassword || credentials.pfxPassword;

    return await loadPfxForAuth(certPath, certPassword);
  }

  async _createClient(tenantId, clientId, certAuth, cacheKey) {
    const msalConfig = {
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientCertificate: {
          thumbprint: certAuth.thumbprint,
          privateKey: certAuth.privateKey,
          x5c: certAuth.x5c
        }
      }
    };

    const cca = new ConfidentialClientApplication(msalConfig);

    // Acquire token to verify auth works and get expiry
    const tokenResponse = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      throw new Error('Failed to acquire access token via client credentials');
    }

    const tokenExpiry = tokenResponse.expiresOn
      ? new Date(tokenResponse.expiresOn).getTime()
      : Date.now() + 3600 * 1000; // default 1 hour

    // Create Graph client with auto-refresh auth provider
    const graphClient = Client.init({
      authProvider: async (done) => {
        try {
          const current = this.clients.get(cacheKey);
          if (current && current.tokenExpiry > Date.now() + this.TOKEN_REFRESH_BUFFER_MS) {
            // Reuse cached token
            const refreshed = await current.cca.acquireTokenByClientCredential({
              scopes: ['https://graph.microsoft.com/.default']
            });
            if (refreshed && refreshed.accessToken) {
              current.tokenExpiry = refreshed.expiresOn
                ? new Date(refreshed.expiresOn).getTime()
                : Date.now() + 3600 * 1000;
              return done(null, refreshed.accessToken);
            }
          }

          const response = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default']
          });
          if (!response || !response.accessToken) {
            return done(new Error('Token acquisition failed'), null);
          }
          done(null, response.accessToken);
        } catch (err) {
          done(err, null);
        }
      }
    });

    this.clients.set(cacheKey, { graphClient, tokenExpiry, cca });
    logger.info(`Graph client created for tenant ${tenantId} using certificate auth`);
    return graphClient;
  }
}

module.exports = new GraphAuthService();