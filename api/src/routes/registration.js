const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../services/database');
const { logger } = require('../utils/logger');

const router = express.Router();

// Full super_admin permission set (mirrors ROLE_PERMISSIONS.super_admin in
// middleware/auth.js). Used to bootstrap the very first registered user so the
// platform is usable without manual database promotion.
const SUPER_ADMIN_PERMISSIONS = {
  canManageExtractions: true,
  canRunAnalysis: true,
  canViewReports: true,
  canManageAlerts: true,
  canManageUsers: true,
  canManageOrganization: true,
  canManageClients: true,
  canAccessAllClients: true,
  canManageMsspSettings: true,
  canViewBilling: true,
  canManageSubscriptions: true,
  canUseAdvancedAnalytics: true,
  canAccessThreatIntel: true,
  canManageIntegrations: true,
  canExportData: true,
  canViewAuditLogs: true,
  canManageSystemSettings: true,
  canAccessApi: true,
  canCreateOrganizations: true,
  canDeleteOrganizations: true,
  canManageAllUsers: true,
  canImpersonateUsers: true,
  canViewSystemLogs: true,
  canManageApiKeys: true,
  canManageLicenses: true,
  canConfigureGlobalSettings: true,
  canManageBackups: true,
  canAccessDeveloperTools: true,
  canManageCompliance: true,
  canCreateIncidents: true,
  canManageIncidents: true,
  canEscalateIncidents: true,
  canCloseIncidents: true
};

// Whether the first registered user should be bootstrapped as super_admin.
// Set FIRST_USER_ADMIN=false to require manual promotion instead.
const FIRST_USER_ADMIN = process.env.FIRST_USER_ADMIN !== 'false';

// Get tenant app installation information
router.get('/tenant-app-info', (req, res) => {
  const applicationId = '574cfe92-60a1-4271-9c80-8aba00070e67';
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/callback`;
  const adminConsentUrl = `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=${applicationId}&scope=https://graph.microsoft.com/.default&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  res.json({
    success: true,
    appInfo: {
      displayName: 'MAES',
      applicationId: applicationId,
      adminConsentUrl: adminConsentUrl,
      redirectUri: redirectUri,
      instructions: 'Click the button below to install MAES in your Microsoft 365 tenant. An admin must grant consent for the required permissions.'
    }
  });
});

// Register individual user
router.post('/user', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email, username, password, firstName, lastName, tenantId, consentToken } = req.body;
    
    // Validate required fields
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    
    // Tenant consent is now optional
    const hasTenantConsent = tenantId && consentToken;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Begin transaction
    await client.query('BEGIN');

    // Bootstrap the first registered user as super_admin so the platform is
    // usable out of the box (issue #2). Permission checks fall back to the role
    // mapping in ROLE_PERMISSIONS, so empty {} is fine for role-based access.
    const userCountResult = await client.query('SELECT COUNT(*) AS count FROM maes.users');
    const isFirstUser = Number(userCountResult.rows[0].count) === 0;
    const isBootstrapAdmin = isFirstUser && FIRST_USER_ADMIN;
    const role = isBootstrapAdmin ? 'super_admin' : 'viewer';
    const permissions = isBootstrapAdmin ? SUPER_ADMIN_PERMISSIONS : {};

    // Create user with individual role
    const userQuery = `
      INSERT INTO maes.users (
        id, email, username, password,
        first_name, last_name, role, permissions, is_active,
        preferences
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, username, role
    `;

    const userId = crypto.randomUUID();
    const userValues = [
      userId,
      email,
      username,
      hashedPassword,
      firstName || '',
      lastName || '',
      role,
      JSON.stringify(permissions),
      true,
      JSON.stringify(hasTenantConsent ? {
        tenantId: tenantId,
        consentToken: consentToken,
        consentedAt: new Date().toISOString(),
        registrationSource: 'individual_with_consent'
      } : {
        registrationSource: 'individual_without_consent'
      })
    ];
    
    const userResult = await client.query(userQuery, userValues);
    const newUser = userResult.rows[0];
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info(`Created individual user: ${newUser.id}${hasTenantConsent ? `, tenant: ${tenantId}` : ' (no tenant consent)'}${isBootstrapAdmin ? ' — bootstrapped as first super_admin' : ''}`);
    
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        ...(hasTenantConsent && { tenantId: tenantId })
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('User registration error:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create user. Please try again.' });
  } finally {
    client.release();
  }
});

module.exports = router;