const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, Organization, AuditLog, sequelize } = require('../models');
const { authenticateToken, requirePermission, ROLE_PERMISSIONS } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Generate unique tenant ID
const generateTenantId = () => {
  return `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Generate incident number
const generateIncidentNumber = async (organizationId) => {
  const year = new Date().getFullYear();
  const count = await sequelize.models.Incident.count({
    where: { organizationId }
  });
  return `INC-${year}-${(count + 1).toString().padStart(3, '0')}`;
};

// Register new organization with admin user (combined endpoint)
router.post('/organization', async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { organization, adminUser } = req.body;
    
    // Validate required fields
    if (!organization || !adminUser) {
      return res.status(400).json({ error: 'Organization and admin user details are required' });
    }
    
    // Create organization
    const newOrg = await Organization.create({
      name: organization.name,
      tenantId: organization.tenantId || generateTenantId(),
      organizationType: organization.organizationType || 'standalone',
      subscriptionStatus: 'active',
      serviceTier: organization.serviceTier || 'basic',
      settings: organization.settings || {},
      credentials: {},
      isActive: true,
      metadata: {
        domain: organization.domain,
        industry: organization.industry,
        employeeCount: organization.employeeCount,
        billingEmail: organization.billingEmail
      }
    }, { transaction: t });
    
    // Determine the role based on organization type
    let userRole = adminUser.role;
    if (!userRole) {
      userRole = organization.organizationType === 'mssp' ? 'mssp_admin' : 
                 organization.organizationType === 'client' ? 'client_admin' : 
                 'standalone_admin';
    }
    
    // Create admin user (password will be hashed by the model)
    const newUser = await User.create({
      organizationId: newOrg.id,
      email: adminUser.email,
      username: adminUser.username,
      password: adminUser.password,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      role: userRole,
      permissions: ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.standalone_admin,
      isActive: true
    }, { transaction: t });
    
    // Commit transaction
    await t.commit();
    
    logger.info(`Created organization: ${newOrg.id} with admin user: ${newUser.id}`);
    
    res.status(201).json({
      success: true,
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        tenantId: newOrg.tenantId,
        organizationType: newOrg.organizationType
      },
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role
      }
    });
    
  } catch (error) {
    await t.rollback();
    logger.error('Organization registration error:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create organization. Please try again.' });
  }
});

// Register new organization (MSSP or Client) - original endpoint
router.post('/organizations', async (req, res) => {
  try {
    const {
      name,
      organizationType = 'standalone',
      serviceTier = 'basic',
      msspId = null,
      clientInfo = {},
      billingInfo = {},
      settings = {}
    } = req.body;

    // Validate organization type
    if (!['mssp', 'client', 'standalone'].includes(organizationType)) {
      return res.status(400).json({ error: 'Invalid organization type' });
    }

    // Validate MSSP relationship
    if (organizationType === 'client' && !msspId) {
      return res.status(400).json({ error: 'MSSP ID required for client organizations' });
    }

    if (msspId) {
      const msspOrg = await Organization.findOne({
        where: { id: msspId, organizationType: 'mssp', isActive: true }
      });
      if (!msspOrg) {
        return res.status(400).json({ error: 'Invalid MSSP organization' });
      }
    }

    // Create organization
    const organization = await Organization.create({
      name,
      tenantId: generateTenantId(),
      organizationType,
      serviceTier,
      msspId,
      clientInfo,
      billingInfo,
      settings: {
        ...settings,
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days trial
      }
    });

    logger.info(`Created organization: ${organization.id} (${organizationType})`);

    res.status(201).json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        tenantId: organization.tenantId,
        organizationType: organization.organizationType,
        serviceTier: organization.serviceTier,
        trialEndDate: organization.trialEndDate
      }
    });

  } catch (error) {
    logger.error('Organization registration error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Register new user with organization
router.post('/users', async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      role,
      organizationId,
      msspId = null,
      userType = 'standalone',
      specialization = [],
      accessibleOrganizations = []
    } = req.body;

    // Validate required fields
    if (!email || !username || !password || !organizationId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if organization exists and is active
    const organization = await Organization.findOne({
      where: { id: organizationId, isActive: true }
    });

    if (!organization) {
      return res.status(400).json({ error: 'Invalid organization' });
    }

    // Validate MSSP relationship
    if (msspId) {
      const msspOrg = await Organization.findOne({
        where: { id: msspId, organizationType: 'mssp', isActive: true }
      });
      if (!msspOrg) {
        return res.status(400).json({ error: 'Invalid MSSP organization' });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [sequelize.Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Validate role based on organization type
    const validRoles = {
      mssp: ['mssp_admin', 'mssp_analyst', 'mssp_responder'],
      client: ['client_admin', 'client_analyst', 'client_viewer'],
      standalone: ['standalone_admin', 'standalone_analyst', 'standalone_viewer']
    };

    if (!validRoles[organization.organizationType].includes(role)) {
      return res.status(400).json({ error: `Invalid role for ${organization.organizationType} organization` });
    }

    // Set permissions based on role
    const permissions = ROLE_PERMISSIONS[role] || {};

    // Create user
    const user = await User.create({
      email,
      username,
      password,
      firstName,
      lastName,
      role,
      organizationId,
      msspId,
      userType,
      specialization,
      accessibleOrganizations,
      permissions
    });

    logger.info(`Created user: ${user.id} (${role}) in organization: ${organizationId}`);

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        userType: user.userType,
        organizationId: user.organizationId
      }
    });

  } catch (error) {
    logger.error('User registration error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Complete organization onboarding
router.post('/organizations/:organizationId/onboard', authenticateToken, requirePermission('canManageOrganization'), async (req, res) => {
  try {
    const { organizationId } = req.params;
    const {
      credentials = {},
      settings = {},
      incidentResponseSettings = {}
    } = req.body;

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Update organization with onboarding data
    await organization.update({
      credentials,
      settings: {
        ...organization.settings,
        ...settings
      },
      incidentResponseSettings: {
        ...organization.incidentResponseSettings,
        ...incidentResponseSettings
      }
    });

    logger.info(`Completed onboarding for organization: ${organizationId}`);

    res.json({
      success: true,
      message: 'Organization onboarding completed'
    });

  } catch (error) {
    logger.error('Organization onboarding error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// MSSP client management
router.post('/mssp/:msspId/clients', authenticateToken, requirePermission('canManageClients'), async (req, res) => {
  try {
    const { msspId } = req.params;
    const {
      name,
      serviceTier = 'basic',
      clientInfo = {},
      billingInfo = {},
      settings = {}
    } = req.body;

    // Verify MSSP organization
    const msspOrg = await Organization.findOne({
      where: { id: msspId, organizationType: 'mssp', isActive: true }
    });

    if (!msspOrg) {
      return res.status(404).json({ error: 'MSSP organization not found' });
    }

    // Create client organization
    const clientOrg = await Organization.create({
      name,
      tenantId: generateTenantId(),
      organizationType: 'client',
      serviceTier,
      msspId,
      clientInfo,
      billingInfo,
      settings: {
        ...settings,
        trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    logger.info(`Created client organization: ${clientOrg.id} for MSSP: ${msspId}`);

    res.status(201).json({
      success: true,
      client: {
        id: clientOrg.id,
        name: clientOrg.name,
        tenantId: clientOrg.tenantId,
        serviceTier: clientOrg.serviceTier,
        trialEndDate: clientOrg.trialEndDate
      }
    });

  } catch (error) {
    logger.error('Client creation error:', error);
    res.status(500).json({ error: 'Failed to create client organization' });
  }
});

// Get MSSP clients
router.get('/mssp/:msspId/clients', authenticateToken, requirePermission('canAccessAllClients'), async (req, res) => {
  try {
    const { msspId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const whereClause = {
      msspId,
      organizationType: 'client',
      isActive: true
    };

    if (status) {
      whereClause.subscriptionStatus = status;
    }

    const clients = await Organization.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'tenantId', 'serviceTier', 'subscriptionStatus',
        'trialEndDate', 'subscriptionEndDate', 'createdAt'
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      clients: clients.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: clients.count,
        pages: Math.ceil(clients.count / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Get MSSP clients error:', error);
    res.status(500).json({ error: 'Failed to retrieve clients' });
  }
});

// Update subscription status
router.patch('/organizations/:organizationId/subscription', authenticateToken, requirePermission('canManageSubscriptions'), async (req, res) => {
  try {
    const { organizationId } = req.params;
    const {
      subscriptionStatus,
      serviceTier,
      subscriptionEndDate,
      usageLimits = {}
    } = req.body;

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Update subscription details
    await organization.update({
      subscriptionStatus,
      serviceTier,
      subscriptionEndDate,
      usageLimits: {
        ...organization.usageLimits,
        ...usageLimits
      }
    });

    logger.info(`Updated subscription for organization: ${organizationId}`);

    res.json({
      success: true,
      message: 'Subscription updated successfully'
    });

  } catch (error) {
    logger.error('Subscription update error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get organization statistics
router.get('/organizations/:organizationId/stats', authenticateToken, requirePermission('canViewReports'), async (req, res) => {
  try {
    const { organizationId } = req.params;

    const [
      userCount,
      extractionCount,
      analysisCount,
      alertCount,
      incidentCount
    ] = await Promise.all([
      User.count({ where: { organizationId, isActive: true } }),
      sequelize.models.Extraction.count({ where: { organizationId } }),
      sequelize.models.AnalysisJob.count({ where: { organizationId } }),
      sequelize.models.Alert.count({ where: { organizationId } }),
      sequelize.models.Incident.count({ where: { organizationId } })
    ]);

    const organization = await Organization.findByPk(organizationId, {
      attributes: ['usageStats', 'usageLimits', 'subscriptionStatus', 'serviceTier']
    });

    res.json({
      success: true,
      stats: {
        users: userCount,
        extractions: extractionCount,
        analysisJobs: analysisCount,
        alerts: alertCount,
        incidents: incidentCount,
        usageStats: organization.usageStats,
        usageLimits: organization.usageLimits,
        subscriptionStatus: organization.subscriptionStatus,
        serviceTier: organization.serviceTier
      }
    });

  } catch (error) {
    logger.error('Get organization stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// Bulk user import for MSSP
router.post('/mssp/:msspId/users/bulk', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { msspId } = req.params;
    const { users, organizationId } = req.body;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Users array is required' });
    }

    // Verify organization belongs to MSSP
    const organization = await Organization.findOne({
      where: { id: organizationId, msspId, isActive: true }
    });

    if (!organization) {
      return res.status(400).json({ error: 'Invalid organization for MSSP' });
    }

    const createdUsers = [];
    const errors = [];

    for (const userData of users) {
      try {
        const {
          email,
          username,
          password,
          firstName,
          lastName,
          role,
          specialization = []
        } = userData;

        // Check if user already exists
        const existingUser = await User.findOne({
          where: {
            [sequelize.Op.or]: [{ email }, { username }]
          }
        });

        if (existingUser) {
          errors.push({ email, error: 'User already exists' });
          continue;
        }

        // Create user
        const user = await User.create({
          email,
          username,
          password,
          firstName,
          lastName,
          role,
          organizationId,
          msspId,
          userType: organization.organizationType === 'client' ? 'client' : 'mssp',
          specialization,
          permissions: ROLE_PERMISSIONS[role] || {}
        });

        createdUsers.push({
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role
        });

      } catch (error) {
        errors.push({ email: userData.email, error: error.message });
      }
    }

    logger.info(`Bulk user import completed: ${createdUsers.length} created, ${errors.length} errors`);

    res.json({
      success: true,
      created: createdUsers,
      errors: errors,
      summary: {
        total: users.length,
        created: createdUsers.length,
        errors: errors.length
      }
    });

  } catch (error) {
    logger.error('Bulk user import error:', error);
    res.status(500).json({ error: 'Failed to import users' });
  }
});

module.exports = router; 