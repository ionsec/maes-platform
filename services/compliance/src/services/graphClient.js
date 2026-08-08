const { Client } = require('@microsoft/microsoft-graph-client');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../logger');
const GraphClientWrapper = require('../clients/graphClientWrapper');

class GraphClientService {
  constructor() {
    this.clients = new Map(); // Cache clients by organization
  }

  /**
   * Attach paging/throttling helpers to a Graph client so control checkers can
   * call graphClient.getAllPages(...) instead of hand-rolling .top() calls.
   * The raw .api() surface is left untouched for existing checkers.
   * @param {Client} graphClient
   * @returns {Client} the same client, with helpers attached
   */
  attachHelpers(graphClient) {
    const wrapper = new GraphClientWrapper(graphClient);
    graphClient.getAllPages = wrapper.getAllPages.bind(wrapper);
    graphClient.getPage = wrapper.getPage.bind(wrapper);
    return graphClient;
  }

  /**
   * Create Microsoft Graph client for an organization using certificate authentication
   * @param {Object} credentials - Organization credentials
   * @param {string} credentials.tenantId - Azure AD tenant ID
   * @param {string} credentials.clientId - Application (client) ID
   * @returns {Client} Microsoft Graph client
   */
  async createGraphClient(credentials) {
    const { tenantId, clientId } = credentials;
    
    if (!tenantId || !clientId) {
      throw new Error('Missing required credentials: tenantId and clientId are required');
    }

    // Certificate-based authentication using PEM files
    const keyPath = '/certs/app.key';
    const certPath = '/certs/app.crt';

    try {
      // Check if certificate files exist
      if (!fs.existsSync(keyPath)) {
        throw new Error(`Private key file not found at: ${keyPath}`);
      }
      if (!fs.existsSync(certPath)) {
        throw new Error(`Certificate file not found at: ${certPath}`);
      }

      logger.info(`Loading certificate from: ${certPath} and key from: ${keyPath}`);

      // Read certificate and private key files
      const privateKey = fs.readFileSync(keyPath, 'utf8');
      const certificatePem = fs.readFileSync(certPath, 'utf8');
      
      // Extract the certificate content between BEGIN and END tags
      const certMatch = certificatePem.match(/-----BEGIN CERTIFICATE-----\n([\s\S]+?)\n-----END CERTIFICATE-----/);
      if (!certMatch) {
        throw new Error('Invalid certificate format - could not find certificate data');
      }
      const certBase64 = certMatch[1].replace(/\n/g, '');
      
      // Calculate certificate thumbprint (SHA1 hash of DER-encoded certificate)
      const certBuffer = Buffer.from(certBase64, 'base64');
      const thumbprint = crypto.createHash('sha1').update(certBuffer).digest('hex').toUpperCase();
      
      logger.info(`Calculated certificate thumbprint: ${thumbprint}`);
      
      // MSAL configuration with certificate
      const msalConfig = {
        auth: {
          clientId: clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          clientCertificate: {
            thumbprint: thumbprint,
            privateKey: privateKey,
            x5c: certBase64 // Just the base64 content without headers
          }
        }
      };

      const clientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default']
      };

      // Create MSAL instance
      const cca = new ConfidentialClientApplication(msalConfig);

      // Acquire once up-front so credential problems surface here rather than
      // on the first Graph call.
      const initial = await cca.acquireTokenByClientCredential(clientCredentialRequest);
      if (!initial || !initial.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      // Resolve a token per request. MSAL caches internally and only hits the
      // token endpoint again once the cached token is close to expiring, so the
      // client can be long-lived without going stale.
      const graphClient = Client.init({
        authProvider: async (done) => {
          try {
            const result = await cca.acquireTokenByClientCredential(clientCredentialRequest);
            if (!result || !result.accessToken) {
              throw new Error('Failed to acquire access token');
            }
            done(null, result.accessToken);
          } catch (error) {
            done(error, null);
          }
        }
      });

      logger.info(`Graph client created successfully for tenant: ${tenantId} using certificate authentication`);
      return this.attachHelpers(graphClient);

    } catch (error) {
      logger.error(`Failed to create Graph client for tenant ${tenantId}:`, error);
      throw new Error(`Graph certificate authentication failed: ${error.message}`);
    }
  }

  /**
   * Get cached Graph client or create new one
   * @param {string} organizationId - Organization ID for caching
   * @param {Object} credentials - Organization credentials
   * @returns {Client} Microsoft Graph client
   */
  async getGraphClient(organizationId, credentials) {
    const cacheKey = `${organizationId}_${credentials.tenantId}_${credentials.clientId}`;

    // The client's authProvider refreshes tokens through MSAL on every request,
    // so a cached client never serves an expired token.
    const cached = this.clients.get(cacheKey);
    if (cached) {
      logger.debug(`Reusing cached Graph client for ${cacheKey}`);
      return cached;
    }

    const client = await this.createGraphClient(credentials);
    this.clients.set(cacheKey, client);

    return client;
  }

  /**
   * Test Graph API connection and permissions
   * @param {Client} graphClient - Microsoft Graph client
   * @returns {Object} Connection test results
   */
  async testConnection(graphClient) {
    try {
      const tests = {
        organization: { success: false, error: null },
        users: { success: false, error: null },
        policies: { success: false, error: null },
        directoryRoles: { success: false, error: null }
      };

      // Test 1: Get organization info
      try {
        await graphClient.api('/organization').get();
        tests.organization.success = true;
        logger.debug('Organization endpoint test: SUCCESS');
      } catch (error) {
        tests.organization.error = error.message;
        logger.debug(`Organization endpoint test: FAILED - ${error.message}`);
      }

      // Test 2: Get users (limited)
      try {
        await graphClient.api('/users').select('id,displayName').top(1).get();
        tests.users.success = true;
        logger.debug('Users endpoint test: SUCCESS');
      } catch (error) {
        tests.users.error = error.message;
        logger.debug(`Users endpoint test: FAILED - ${error.message}`);
      }

      // Test 3: Get conditional access policies
      try {
        await graphClient.api('/identity/conditionalAccess/policies').get();
        tests.policies.success = true;
        logger.debug('Conditional access policies test: SUCCESS');
      } catch (error) {
        tests.policies.error = error.message;
        logger.debug(`Conditional access policies test: FAILED - ${error.message}`);
      }

      // Test 4: Get directory roles
      try {
        await graphClient.api('/directoryRoles').get();
        tests.directoryRoles.success = true;
        logger.debug('Directory roles test: SUCCESS');
      } catch (error) {
        tests.directoryRoles.error = error.message;
        logger.debug(`Directory roles test: FAILED - ${error.message}`);
      }

      const successCount = Object.values(tests).filter(test => test.success).length;
      const overallSuccess = successCount >= 2; // At least 2 tests should pass

      return {
        success: overallSuccess,
        tests,
        successCount,
        totalTests: Object.keys(tests).length,
        summary: overallSuccess ? 
          'Graph API connection successful with sufficient permissions' : 
          'Graph API connection has issues or insufficient permissions'
      };

    } catch (error) {
      logger.error('Graph API connection test failed:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Failed to test Graph API connection'
      };
    }
  }

  /**
   * Clear cached client
   * @param {string} organizationId - Organization ID
   */
  clearCache(organizationId) {
    const keysToDelete = [];
    for (const key of this.clients.keys()) {
      if (key.startsWith(organizationId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.clients.delete(key));
    logger.debug(`Cleared Graph client cache for organization: ${organizationId}`);
  }
}

module.exports = new GraphClientService();