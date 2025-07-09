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
    const orgData = organization.toJSON();
    
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

      const [updatedRows] = await Organization.update(updateData, {
        where: { id: req.organizationId }
      });

      if (updatedRows === 0) {
        return res.status(404).json({
          error: 'Organization not found'
        });
      }

      const updatedOrganization = await Organization.findByPk(req.organizationId, {
        attributes: { exclude: ['credentials'] }
      });

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

      const [updatedRows] = await Organization.update(
        { credentials },
        { where: { id: req.organizationId } }
      );

      if (updatedRows === 0) {
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

      // Use PowerShell to test the connection
      const { spawn } = require('child_process');
      
      let testCommand = `Import-Module Microsoft-Extractor-Suite -Force; `;
      
      if (certificateThumbprint) {
        // Test with certificate thumbprint
        testCommand += `try { Connect-M365 -AppId '${applicationId}' -CertificateThumbprint '${certificateThumbprint}' -Organization '${fqdn}' -ErrorAction Stop; Write-Host 'CONNECTION_SUCCESS'; Disconnect-ExchangeOnline -Confirm:$false } catch { Write-Host "CONNECTION_ERROR: $_" }`;
      } else {
        // Test with client secret
        testCommand += `$SecureSecret = ConvertTo-SecureString -String '${clientSecret}' -AsPlainText -Force; `;
        testCommand += `try { Connect-M365 -AppId '${applicationId}' -ClientSecretCredential (New-Object System.Management.Automation.PSCredential('${applicationId}', $SecureSecret)) -Organization '${fqdn}' -ErrorAction Stop; Write-Host 'CONNECTION_SUCCESS'; Disconnect-ExchangeOnline -Confirm:$false } catch { Write-Host "CONNECTION_ERROR: $_" }`;
      }

      const ps = spawn('pwsh', ['-Command', testCommand]);
      
      let output = '';
      let errorOutput = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ps.on('close', (code) => {
        logger.info(`Connection test output: ${output}`);
        if (errorOutput) logger.error(`Connection test error: ${errorOutput}`);
        
        if (output.includes('CONNECTION_SUCCESS')) {
          res.json({
            success: true,
            message: 'Connection test successful',
            details: {
              applicationId,
              fqdn,
              authMethod: certificateThumbprint ? 'certificate' : 'clientSecret'
            }
          });
        } else if (output.includes('CONNECTION_ERROR:')) {
          const errorMatch = output.match(/CONNECTION_ERROR: (.+)/);
          const errorMessage = errorMatch ? errorMatch[1].trim() : 'Unknown error';
          
          // Parse specific error types
          let userMessage = 'Connection test failed';
          let recommendations = [];
          
          if (errorMessage.includes('AADSTS700016') || errorMessage.includes('Application with identifier')) {
            userMessage = 'Invalid Application ID or insufficient permissions';
            recommendations = [
              'Verify the Application ID is correct',
              'Ensure the app has Exchange.ManageAsApp permission',
              'Check that admin consent has been granted'
            ];
          } else if (errorMessage.includes('Organization') && errorMessage.includes('not found')) {
            userMessage = 'Organization not found';
            recommendations = [
              'Verify the FQDN is correct (e.g., contoso.onmicrosoft.com)',
              'Do not use Tenant ID - use the domain name instead'
            ];
          } else if (errorMessage.includes('certificate')) {
            userMessage = 'Certificate authentication failed';
            recommendations = [
              'Verify the certificate thumbprint is correct',
              'Ensure the certificate is uploaded to the Azure app',
              'Check certificate expiration date'
            ];
          } else if (errorMessage.includes('client_credentials')) {
            userMessage = 'Client secret authentication failed';
            recommendations = [
              'Verify the client secret is correct',
              'Check if the client secret has expired',
              'Ensure the app has proper API permissions'
            ];
          }
          
          res.status(400).json({
            error: userMessage,
            details: {
              errorMessage,
              recommendations
            }
          });
        } else {
          res.status(500).json({
            error: 'Connection test failed',
            details: {
              output,
              errorOutput
            }
          });
        }
      });
      
      ps.on('error', (error) => {
        logger.error('PowerShell spawn error:', error);
        res.status(500).json({
          error: 'Failed to run connection test',
          details: error.message
        });
      });
      
      // Set a timeout for the test
      setTimeout(() => {
        ps.kill();
        res.status(504).json({
          error: 'Connection test timed out',
          details: 'The test took too long to complete'
        });
      }, 30000); // 30 second timeout

    } catch (error) {
      logger.error('Test connection error:', error);
      res.status(500).json({
        error: 'Internal server error'
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