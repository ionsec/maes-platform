const jwt = require('jsonwebtoken');
const { pool, getRow } = require('../services/database');
const { logger } = require('../utils/logger');

// Service authentication token for internal service communication
const SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'internal-service-token';

// Enhanced permission mapping for MSSP roles
const ROLE_PERMISSIONS = {
  super_admin: {
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
    canAccessApi: true
  },
  mssp_admin: {
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
    canManageSystemSettings: false,
    canAccessApi: true
  },
  mssp_analyst: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: true,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: true,
    canCloseIncidents: true,
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  mssp_responder: {
    canManageExtractions: false,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: true,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: true,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: true,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  client_admin: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: true,
    canManageOrganization: true,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  client_analyst: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  client_viewer: {
    canManageExtractions: false,
    canRunAnalysis: false,
    canViewReports: true,
    canManageAlerts: false,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: false,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  standalone_admin: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: true,
    canManageOrganization: true,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  standalone_analyst: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  standalone_viewer: {
    canManageExtractions: false,
    canRunAnalysis: false,
    canViewReports: true,
    canManageAlerts: false,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: false,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  admin: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: true,
    canManageOrganization: true,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  analyst: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: false,
    canCloseIncidents: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  },
  viewer: {
    canManageExtractions: false,
    canRunAnalysis: false,
    canViewReports: true,
    canManageAlerts: false,
    canManageUsers: false,
    canManageOrganization: false,
    canManageClients: false,
    canAccessAllClients: false,
    canManageMsspSettings: false,
    canViewBilling: false,
    canManageSubscriptions: false,
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
    canManageIntegrations: false,
    canExportData: false,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false
  }
};

// Authenticate JWT token (with service token bypass)
const authenticateToken = async (req, res, next) => {
  try {
    // Check for service token first (for internal service communication)
    const serviceToken = req.headers['x-service-token'];
    logger.info(`Service token check: provided=${serviceToken ? 'PRESENT' : 'MISSING'}, expected=PRESENT, match=${serviceToken === process.env.SERVICE_AUTH_TOKEN}`);
    
    if (serviceToken === process.env.SERVICE_AUTH_TOKEN) {
      // Skip JWT authentication for internal services
      logger.info('Service token authenticated, bypassing JWT');
      req.isServiceRequest = true;
      return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      // Get user from database
      const userResult = await pool.query(
        `SELECT u.*, o.organization_type, o.is_active as org_active 
         FROM maes.users u
         LEFT JOIN maes.organizations o ON u.organization_id = o.id
         WHERE u.id = $1 AND u.is_active = true`,
        [decoded.userId]
      );

      const user = userResult.rows[0];
      if (!user) {
        return res.status(403).json({ error: 'User not found or inactive' });
      }

      // Check organization status only if user has an organization
      if (user.organization_id && !user.org_active) {
        return res.status(403).json({ error: 'Organization is inactive' });
      }

      // Parse permissions if they're stored as JSON string
      if (typeof user.permissions === 'string') {
        try {
          user.permissions = JSON.parse(user.permissions);
        } catch (e) {
          user.permissions = ROLE_PERMISSIONS[user.role] || {};
        }
      }

      req.user = user;
      req.userId = user.id;
      req.organizationId = user.organization_id;
      next();
    });
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Service-to-service authentication
const authenticateService = (req, res, next) => {
  const token = req.headers['x-service-auth'];
  
  if (!token || token !== SERVICE_AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid service authentication' });
  }
  
  req.isServiceAuth = true;
  next();
};

// Permission middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = req.user.permissions || {};
    
    if (!userPermissions[permission]) {
      logger.warn(`User ${req.user.id} attempted to access ${permission} without permission`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Role-based access control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`User ${req.user.id} with role ${req.user.role} attempted to access role-restricted resource`);
      return res.status(403).json({ error: 'Insufficient role privileges' });
    }

    next();
  };
};

// Log audit trail
const auditLog = async (userId, organizationId, action, details = {}) => {
  try {
    await pool.query(
      `INSERT INTO maes.audit_logs (
        id, user_id, organization_id, action, category, 
        resource, resource_id, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        require('uuid').v4(),
        userId,
        organizationId,
        action,
        details.category || 'general',
        details.resource || null,
        details.resourceId || null,
        JSON.stringify(details)
      ]
    );
  } catch (error) {
    logger.error('Audit log error:', error);
  }
};

module.exports = {
  authenticateToken,
  authenticateService,
  requirePermission,
  requireRole,
  auditLog,
  ROLE_PERMISSIONS
};