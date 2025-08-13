const express = require('express');
const { body, validationResult } = require('express-validator');
const { Organization, User } = require('../services/models');
const { authenticateToken, requireRole, requireAdminRole, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

// Organization cleanup function
async function performOrganizationCleanup(organizationId) {
  const { pool } = require('../services/database');
  const axios = require('axios');
  const serviceToken = process.env.SERVICE_AUTH_TOKEN;
  
  logger.info(`Starting organization cleanup for: ${organizationId}`);
  
  try {
    // 1. Clean up Postgres data
    logger.info(`Cleaning up Postgres data for organization: ${organizationId}`);
    
    // Delete extractions and related data
    await pool.query('DELETE FROM maes.extractions WHERE organization_id = $1', [organizationId]);
    await pool.query('DELETE FROM maes.analysis_jobs WHERE organization_id = $1', [organizationId]);
    await pool.query('DELETE FROM maes.alerts WHERE organization_id = $1', [organizationId]);
    await pool.query('DELETE FROM maes.audit_logs WHERE organization_id = $1', [organizationId]);
    await pool.query('DELETE FROM maes.user_organizations WHERE organization_id = $1', [organizationId]);
    await pool.query('DELETE FROM maes.users WHERE organization_id = $1', [organizationId]);
    
    // 2. Clean up Redis data
    logger.info(`Cleaning up Redis data for organization: ${organizationId}`);
    const redis = require('redis');
    const redisClient = redis.createClient({
      url: `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`
    });
    
    await redisClient.connect();
    
    // Clean up Redis keys for this organization
    const pattern = `*${organizationId}*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Deleted ${keys.length} Redis keys for organization: ${organizationId}`);
    }
    
    await redisClient.disconnect();
    
    // 3. Clean up Extractor service data
    logger.info(`Cleaning up Extractor service data for organization: ${organizationId}`);
    try {
      await axios.delete(`http://extractor:3000/api/cleanup/organization/${organizationId}`, {
        headers: { 'x-service-token': serviceToken },
        timeout: 30000
      });
    } catch (extractorError) {
      logger.warn(`Extractor cleanup failed (service may be down): ${extractorError.message}`);
    }
    
    // 4. Clean up Analyzer service data
    logger.info(`Cleaning up Analyzer service data for organization: ${organizationId}`);
    try {
      await axios.delete(`http://analyzer:3000/api/cleanup/organization/${organizationId}`, {
        headers: { 'x-service-token': serviceToken },
        timeout: 30000
      });
    } catch (analyzerError) {
      logger.warn(`Analyzer cleanup failed (service may be down): ${analyzerError.message}`);
    }
    
    logger.info(`Organization cleanup completed for: ${organizationId}`);
    
  } catch (error) {
    logger.error(`Organization cleanup failed for ${organizationId}:`, error);
    throw error;
  }
}

// Apply authentication and rate limiting to all routes
router.use(authenticateToken);
router.use(apiRateLimiter);

// Get current organization
router.get('/current', async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.organizationId);

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    // Return organization with credentials for UI display
    const orgData = { ...organization };
    
    // Check if user wants to see actual credentials
    const showCredentials = req.query.showCredentials === 'true';
    
    // Show if credentials are configured
    if (orgData.credentials && Object.keys(orgData.credentials).length > 0) {
      if (showCredentials) {
        // Return actual credentials (they will be decrypted by the getter)
        orgData.credentials = {
          applicationId: orgData.credentials.applicationId || null,
          clientSecret: orgData.credentials.clientSecret || null,
          certificateThumbprint: orgData.credentials.certificateThumbprint || null
        };
      } else {
        // Return masked credentials
        orgData.credentials = {
          applicationId: orgData.credentials.applicationId ? '••••••••••••••••' : null,
          clientSecret: orgData.credentials.clientSecret ? '••••••••••••••••' : null,
          certificateThumbprint: orgData.credentials.certificateThumbprint ? '••••••••••••••••' : null
        };
      }
    }

    res.json({
      success: true,
      organization: orgData
    });

  } catch (error) {
    logger.error('Get organization error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Update organization settings
router.put('/current', 
  requirePermission('canManageOrganization'),
  [
    body('name').optional().isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
    body('tenantId').optional().isUUID().withMessage('Tenant ID must be a valid UUID'),
    body('fqdn').optional().matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/).withMessage('FQDN must be a valid domain name'),
    body('settings').optional().isObject().withMessage('Settings must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { name, tenantId, fqdn, settings } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (tenantId) updateData.tenantId = tenantId;
      if (fqdn) updateData.fqdn = fqdn;
      if (settings) updateData.settings = { ...settings };

      const updatedOrganization = await Organization.update(req.organizationId, updateData);

      if (!updatedOrganization) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }

      res.json({
        success: true,
        organization: updatedOrganization
      });

    } catch (error) {
      logger.error('Update organization error:', error);
      
      // Return specific error message for known errors
      if (error.message && error.message.includes('already exists')) {
        return res.status(409).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: error.message || 'Internal server error'
      });
    }
  }
);

// Update organization credentials
router.put('/current/credentials', 
  requirePermission('canManageOrganization'),
  [
    body('applicationId').isUUID().withMessage('Application ID must be a valid UUID'),
    body('clientSecret').optional().custom((value) => {
      if (value !== undefined && value !== null && value !== '') {
        return value.length >= 1;
      }
      return true;
    }).withMessage('Client Secret cannot be empty if provided'),
    body('certificateThumbprint').optional().custom((value) => {
      if (value !== undefined && value !== null && value !== '') {
        return value.length >= 1;
      }
      return true;
    }).withMessage('Certificate Thumbprint cannot be empty if provided')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.error('Credentials validation failed:', errors.array());
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { applicationId, clientSecret, certificateThumbprint } = req.body;
      
      // Validate that either certificate or client secret is provided
      if (!certificateThumbprint && !clientSecret) {
        return res.status(400).json({
          error: 'Either certificateThumbprint or clientSecret must be provided'
        });
      }
      
      const credentials = {
        applicationId,
        clientSecret: clientSecret || null,
        certificateThumbprint: certificateThumbprint || null
      };

      const updatedOrganization = await Organization.update(req.organizationId, { credentials });

      if (!updatedOrganization) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }

      res.json({
        success: true,
        message: 'Credentials updated successfully'
      });

    } catch (error) {
      logger.error('Update organization credentials error:', error);
      res.status(500).json({
        error: error.message || 'Internal server error'
      });
    }
  }
);

// Test Azure app connectivity
router.post('/test-connection',
  authenticateToken,
  requirePermission('canManageOrganization'),
  [
    body('applicationId').isUUID().withMessage('Application ID must be a valid UUID'),
    body('fqdn').matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/).withMessage('FQDN must be a valid domain name'),
    body('certificateThumbprint').optional().custom((value) => {
      if (value !== undefined && value !== null && value !== '') {
        return value.length >= 1;
      }
      return true;
    }).withMessage('Certificate Thumbprint cannot be empty if provided'),
    body('clientSecret').optional().custom((value) => {
      if (value !== undefined && value !== null && value !== '') {
        return value.length >= 1;
      }
      return true;
    }).withMessage('Client Secret cannot be empty if provided')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { applicationId, fqdn, certificateThumbprint, clientSecret } = req.body;
      
      // Validate that either certificate or client secret is provided
      if (!certificateThumbprint && !clientSecret) {
        return res.status(400).json({
          error: 'Either certificateThumbprint or clientSecret must be provided'
        });
      }

      // Create a test job for the extractor service to handle
      const { createTestConnectionJob } = require('../services/jobService');
      
      // Get organization data to include tenant ID
      const { getRow } = require('../services/database');
      const organization = await getRow(
        'SELECT tenant_id FROM maes.organizations WHERE id = $1',
        [req.organizationId]
      );

      const testData = {
        applicationId,
        fqdn,
        tenantId: organization.tenant_id,
        certificateThumbprint,
        clientSecret,
        organizationId: req.organizationId,
        userId: req.user.id
      };

      const job = await createTestConnectionJob(testData);
      
      // For now, return success - in a real implementation you'd want to:
      // 1. Create a WebSocket connection to get real-time results
      // 2. Or poll a status endpoint
      // 3. Or store the result in the database and return it
      
      // For demo purposes, we'll wait for the job to complete and return results
      // In production, this should be handled via WebSocket or polling
      try {
        const jobResult = await job.finished();
        res.json({
          success: true,
          message: jobResult.connectionStatus === 'success' ? 'Connection test successful' : 'Connection test failed',
          jobId: job.id,
          ualStatus: jobResult.ualStatus,
          graphStatus: jobResult.graphStatus,
          details: {
            applicationId,
            fqdn,
            tenantId: organization.tenant_id,
            authMethod: certificateThumbprint ? 'certificate' : 'clientSecret',
            connectionStatus: jobResult.connectionStatus,
            graphConnectionStatus: jobResult.graphStatus,
            testResult: jobResult.result
          }
        });
      } catch (jobError) {
        res.status(500).json({
          success: false,
          message: 'Connection test failed',
          jobId: job.id,
          details: {
            applicationId,
            fqdn,
            authMethod: certificateThumbprint ? 'certificate' : 'clientSecret',
            error: jobError.message
          }
        });
      }

    } catch (error) {
      logger.error('Test connection error:', error);
      res.status(500).json({
        error: 'Failed to queue connection test',
        details: error.message
      });
    }
  }
);

// Get organization statistics
router.get('/stats', async (req, res) => {
  try {
    // Get user count using our custom models
    const { getRow } = require('../services/database');
    const userCountResult = await getRow(
      'SELECT COUNT(*) as count FROM maes.users WHERE organization_id = $1 AND is_active = true',
      [req.organizationId]
    );
    const userCount = parseInt(userCountResult.count);

    // Additional statistics would be gathered from other models
    const stats = {
      totalUsers: userCount,
      activeUsers: userCount, // This would be calculated based on recent activity
      // Add more statistics as needed
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Get organization stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete organization (admin only)
// Offboard organization (soft delete with grace period)
router.post('/:organizationId/offboard',
  requireAdminRole(),
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { gracePeriodDays = 7, reason = 'User requested offboarding' } = req.body;
      
      // Prevent offboarding of default organization
      if (organizationId === '00000000-0000-0000-0000-000000000001') {
        return res.status(403).json({
          error: 'Cannot offboard the default organization'
        });
      }
      
      // Check if organization exists
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }
      
      // Check if already offboarded
      if (organization.offboard_scheduled_at) {
        return res.status(409).json({
          error: 'Organization is already scheduled for offboarding',
          scheduledAt: organization.offboard_scheduled_at
        });
      }
      
      // Schedule offboarding
      const offboardAt = new Date();
      offboardAt.setDate(offboardAt.getDate() + gracePeriodDays);
      
      const { pool } = require('../services/database');
      await pool.query(`
        UPDATE maes.organizations 
        SET 
          is_active = false,
          offboard_scheduled_at = $1,
          offboard_reason = $2,
          offboard_grace_period_days = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [offboardAt, reason, gracePeriodDays, organizationId]);
      
      // Create offboarding job
      const { createOffboardingJob } = require('../services/jobService');
      await createOffboardingJob(organizationId, offboardAt);
      
      logger.info(`Organization offboarding scheduled: ${organizationId} by user: ${req.user.id}, cleanup at: ${offboardAt}`);
      
      res.json({
        success: true,
        message: `Organization offboarding scheduled. Data will be permanently deleted after ${gracePeriodDays} days.`,
        offboardScheduledAt: offboardAt,
        gracePeriodDays
      });
      
    } catch (error) {
      logger.error('Offboard organization error:', error);
      res.status(500).json({
        error: error.message || 'Failed to offboard organization'
      });
    }
  }
);

// Cancel organization offboarding (restore)
router.post('/:organizationId/restore',
  requireAdminRole(),
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      
      // Check if organization exists
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }
      
      // Check if actually scheduled for offboarding
      if (!organization.offboard_scheduled_at) {
        return res.status(409).json({
          error: 'Organization is not scheduled for offboarding'
        });
      }
      
      // Cancel offboarding
      const { pool } = require('../services/database');
      await pool.query(`
        UPDATE maes.organizations 
        SET 
          is_active = true,
          offboard_scheduled_at = NULL,
          offboard_reason = NULL,
          offboard_grace_period_days = NULL,
          updated_at = NOW()
        WHERE id = $1
      `, [organizationId]);
      
      logger.info(`Organization offboarding cancelled: ${organizationId} by user: ${req.user.id}`);
      
      res.json({
        success: true,
        message: 'Organization offboarding cancelled and organization restored'
      });
      
    } catch (error) {
      logger.error('Restore organization error:', error);
      res.status(500).json({
        error: error.message || 'Failed to restore organization'
      });
    }
  }
);

// Immediate deletion (admin only)
router.delete('/:organizationId', 
  requireAdminRole(),
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { force = false } = req.query;
      
      // Prevent deletion of default organization
      if (organizationId === '00000000-0000-0000-0000-000000000001') {
        return res.status(403).json({
          error: 'Cannot delete the default organization'
        });
      }
      
      // Check if organization exists
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }
      
      // Check if there are any active extractions unless forced
      if (!force) {
        const { Extraction } = require('../services/models');
        const activeExtractions = await Extraction.countByOrganization(organizationId, {
          status: ['pending', 'running']
        });
        
        if (activeExtractions > 0) {
          return res.status(409).json({
            error: 'Cannot delete organization with active extractions. Use ?force=true to override or cancel/wait for extractions to complete.'
          });
        }
      }
      
      // Perform immediate cleanup
      await performOrganizationCleanup(organizationId);
      
      // Delete the organization (this will cascade delete related data)
      await Organization.delete(organizationId);
      
      logger.info(`Organization immediately deleted: ${organizationId} by user: ${req.user.id}`);
      
      res.json({
        success: true,
        message: 'Organization and all associated data deleted successfully'
      });
      
    } catch (error) {
      logger.error('Delete organization error:', error);
      res.status(500).json({
        error: error.message || 'Failed to delete organization'
      });
    }
  }
);

// Get organization configuration status
router.get('/configuration-status', async (req, res) => {
  try {
    const organization = await Organization.findById(req.organizationId);

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    const configStatus = Organization.getConfigurationStatus(organization);

    res.json({
      success: true,
      organizationId: organization.id,
      organizationName: organization.name,
      ...configStatus
    });

  } catch (error) {
    logger.error('Get organization configuration status error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;