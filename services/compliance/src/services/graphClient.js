const { Client } = require('@microsoft/microsoft-graph-client');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { logger } = require('../logger');

class GraphClientService {
  constructor() {
    this.clients = new Map(); // Cache clients by organization
  }

  /**
   * Create Microsoft Graph client for an organization
   * @param {Object} credentials - Organization credentials
   * @param {string} credentials.tenantId - Azure AD tenant ID
   * @param {string} credentials.clientId - Application (client) ID
   * @param {string} credentials.clientSecret - Client secret
   * @returns {Client} Microsoft Graph client
   */
  async createGraphClient(credentials) {
    const { tenantId, clientId, clientSecret } = credentials;
    
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing required credentials: tenantId, clientId, and clientSecret are required');
    }

    // Create MSAL configuration
    const msalConfig = {
      auth: {
        clientId: clientId,
        clientSecret: clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`
      }
    };

    const clientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default']
    };

    try {
      // Create MSAL instance
      const cca = new ConfidentialClientApplication(msalConfig);
      
      // Get access token
      const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
      
      if (!response || !response.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      // Create Graph client
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, response.accessToken);
        }
      });

      logger.info(`Graph client created successfully for tenant: ${tenantId}`);
      return graphClient;

    } catch (error) {
      logger.error(`Failed to create Graph client for tenant ${tenantId}:`, error);
      throw new Error(`Graph authentication failed: ${error.message}`);
    }
  }

  /**
   * Get cached Graph client or create new one
   * @param {string} organizationId - Organization ID for caching
   * @param {Object} credentials - Organization credentials
   * @returns {Client} Microsoft Graph client
   */
  async getGraphClient(organizationId, credentials) {
    const cacheKey = `${organizationId}_${credentials.tenantId}`;
    
    // For now, we'll create a new client each time to avoid token expiration issues
    // In production, implement proper token refresh logic
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