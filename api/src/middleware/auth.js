const jwt = require('jsonwebtoken');
const { User, Organization, AuditLog } = require('../models');
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
    canCloseIncidents: false,
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: true,
    canManageSystemSettings: false,
    canAccessApi: true
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
    canUseAdvancedAnalytics: false,
    canAccessThreatIntel: false,
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
  }
};

// Service authentication middleware
const authenticateService = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  
  if (serviceToken === SERVICE_AUTH_TOKEN) {
    req.isServiceRequest = true;
    return next();
  }
  
  return res.status(401).json({ error: 'Invalid service token' });
};

// Enhanced authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    // Check for service token first
    const serviceToken = req.headers['x-service-token'];
    if (serviceToken === SERVICE_AUTH_TOKEN) {
      req.isServiceRequest = true;
      return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user with organization details
    const user = await User.scope('withPassword').findOne({
      where: { id: decoded.userId, isActive: true },
      include: [
        {
          model: Organization,
          as: 'Organization',
          attributes: ['id', 'name', 'tenantId', 'organizationType', 'subscriptionStatus', 'serviceTier', 'isActive']
        }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ error: 'Account is locked' });
    }

    // Check organization subscription status
    if (user.Organization && !user.Organization.hasActiveSubscription()) {
      return res.status(402).json({ error: 'Subscription required' });
    }

    // Set user permissions based on role
    user.permissions = {
      ...user.permissions,
      ...ROLE_PERMISSIONS[user.role] || {}
    };

    req.user = user;
    req.organizationId = user.organizationId;
    req.userType = user.userType;
    req.role = user.role;

    // Log authentication
    await AuditLog.create({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'authenticate',
      category: 'authentication',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      requestMethod: req.method,
      requestPath: req.path,
      statusCode: 200,
      details: {
        userType: user.userType,
        role: user.role
      }
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Enhanced permission middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (req.isServiceRequest) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.hasPermission(permission)) {
      logger.warn(`Permission denied: ${req.user.id} attempted to access ${permission}`);
      
      AuditLog.create({
        userId: req.user.id,
        organizationId: req.organizationId,
        action: 'permission_denied',
        category: 'authorization',
        ipAddress: req.ip,
        requestMethod: req.method,
        requestPath: req.path,
        statusCode: 403,
        details: {
          requiredPermission: permission,
          userRole: req.user.role,
          userPermissions: req.user.permissions
        }
      });

      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Organization access middleware
const requireOrganizationAccess = (organizationIdParam = 'organizationId') => {
  return async (req, res, next) => {
    if (req.isServiceRequest) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const targetOrgId = req.params[organizationIdParam] || req.body.organizationId || req.organizationId;

    if (!req.user.canAccessOrganization(targetOrgId)) {
      logger.warn(`Organization access denied: ${req.user.id} attempted to access org ${targetOrgId}`);
      
      AuditLog.create({
        userId: req.user.id,
        organizationId: req.organizationId,
        action: 'organization_access_denied',
        category: 'authorization',
        ipAddress: req.ip,
        requestMethod: req.method,
        requestPath: req.path,
        statusCode: 403,
        details: {
          targetOrganizationId: targetOrgId,
          userRole: req.user.role,
          accessibleOrganizations: req.user.accessibleOrganizations
        }
      });

      return res.status(403).json({ error: 'Access to organization denied' });
    }

    next();
  };
};

// MSSP-specific middleware
const requireMsspAccess = () => {
  return (req, res, next) => {
    if (req.isServiceRequest) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.isMsspUser() && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'MSSP access required' });
    }

    next();
  };
};

// Client organization middleware
const requireClientAccess = () => {
  return (req, res, next) => {
    if (req.isServiceRequest) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.isMsspUser() && !req.user.hasPermission('canAccessAllClients')) {
      return res.status(403).json({ error: 'Client access permission required' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  authenticateService,
  requirePermission,
  requireOrganizationAccess,
  requireMsspAccess,
  requireClientAccess,
  ROLE_PERMISSIONS
};