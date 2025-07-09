const express = require('express');
const { body, validationResult } = require('express-validator');
const { Organization, User } = require('../services/models');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

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
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Update organization credentials
router.put('/current/credentials', 
  requirePermission('canManageOrganization'),
  [
    body('applicationId').isUUID().withMessage('Application ID must be a valid UUID'),
    body('clientSecret').isLength({ min: 1 }).withMessage('Client Secret is required'),
    body('certificateThumbprint').optional({ values: 'falsy' }).isLength({ min: 1 }).withMessage('Certificate Thumbprint cannot be empty if provided')
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
      
      const credentials = {
        applicationId,
        clientSecret,
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
        error: 'Internal server error'
      });
    }
  }
);

// Test Azure app connectivity
router.post('/test-connection',
  requirePermission('canManageOrganization'),
  [
    body('applicationId').isUUID().withMessage('Application ID must be a valid UUID'),
    body('fqdn').matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/).withMessage('FQDN must be a valid domain name'),
    body('certificateThumbprint').optional().isLength({ min: 1 }).withMessage('Certificate Thumbprint cannot be empty if provided'),
    body('clientSecret').optional().isLength({ min: 1 }).withMessage('Client Secret cannot be empty if provided')
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
      
      const testData = {
        applicationId,
        fqdn,
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
      
      res.json({
        success: true,
        message: 'Connection test queued successfully',
        jobId: job.id,
        details: {
          applicationId,
          fqdn,
          authMethod: certificateThumbprint ? 'certificate' : 'clientSecret',
          note: 'Connection test has been queued for processing by the extractor service'
        }
      });

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
    // Get user count
    const userCount = await User.count({
      where: { organizationId: req.organizationId, isActive: true }
    });

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

module.exports = router;