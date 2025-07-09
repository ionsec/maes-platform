const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, insert, getRow } = require('../services/database');
const { authenticateToken, requirePermission, ROLE_PERMISSIONS } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Generate unique tenant ID
const generateTenantId = () => {
  return `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Register new organization with admin user (combined endpoint)
router.post('/organization', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { organization, adminUser } = req.body;
    
    // Validate required fields
    if (!organization || !adminUser) {
      return res.status(400).json({ error: 'Organization and admin user details are required' });
    }
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Create organization
    const orgQuery = `
      INSERT INTO maes.organizations (
        id, name, tenant_id, organization_type, subscription_status,
        service_tier, settings, credentials, is_active, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, tenant_id, organization_type
    `;
    
    const orgId = uuidv4();
    const orgValues = [
      orgId,
      organization.name,
      organization.tenantId || generateTenantId(),
      organization.organizationType || 'standalone',
      'active',
      organization.serviceTier || 'basic',
      JSON.stringify(organization.settings || {}),
      JSON.stringify({}),
      true,
      JSON.stringify({
        domain: organization.domain,
        industry: organization.industry,
        employeeCount: organization.employeeCount,
        billingEmail: organization.billingEmail
      })
    ];
    
    const orgResult = await client.query(orgQuery, orgValues);
    const newOrg = orgResult.rows[0];
    
    // Determine the role based on organization type
    let userRole = adminUser.role;
    if (!userRole) {
      userRole = organization.organizationType === 'mssp' ? 'mssp_admin' : 
                 organization.organizationType === 'client' ? 'client_admin' : 
                 'standalone_admin';
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminUser.password, 10);
    
    // Create admin user
    const userQuery = `
      INSERT INTO maes.users (
        id, organization_id, email, username, password,
        first_name, last_name, role, permissions, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, username, role
    `;
    
    const userValues = [
      uuidv4(),
      orgId,
      adminUser.email,
      adminUser.username,
      hashedPassword,
      adminUser.firstName,
      adminUser.lastName,
      userRole,
      JSON.stringify(ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.standalone_admin),
      true
    ];
    
    const userResult = await client.query(userQuery, userValues);
    const newUser = userResult.rows[0];
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info(`Created organization: ${newOrg.id} with admin user: ${newUser.id}`);
    
    res.status(201).json({
      success: true,
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        tenantId: newOrg.tenant_id,
        organizationType: newOrg.organization_type
      },
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Organization registration error:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create organization. Please try again.' });
  } finally {
    client.release();
  }
});

// Get organization statistics
router.get('/organizations/:organizationId/stats', authenticateToken, requirePermission('canViewReports'), async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Get counts
    const queries = [
      { name: 'users', query: 'SELECT COUNT(*) FROM maes.users WHERE organization_id = $1 AND is_active = true' },
      { name: 'extractions', query: 'SELECT COUNT(*) FROM maes.extractions WHERE organization_id = $1' },
      { name: 'analysisJobs', query: 'SELECT COUNT(*) FROM maes.analysis_jobs WHERE organization_id = $1' },
      { name: 'alerts', query: 'SELECT COUNT(*) FROM maes.alerts WHERE organization_id = $1' }
    ];

    const stats = {};
    for (const q of queries) {
      const result = await pool.query(q.query, [organizationId]);
      stats[q.name] = parseInt(result.rows[0].count);
    }

    // Get organization details
    const orgResult = await pool.query(
      'SELECT subscription_status, service_tier FROM maes.organizations WHERE id = $1',
      [organizationId]
    );
    
    const org = orgResult.rows[0];
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({
      success: true,
      stats: {
        ...stats,
        subscriptionStatus: org.subscription_status,
        serviceTier: org.service_tier
      }
    });

  } catch (error) {
    logger.error('Get organization stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

module.exports = router;