const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, getRow } = require('../services/database');
const { logger } = require('../utils/logger');
const redis = require('redis');

// Redis client for token blacklisting
let redisClient = null;
let redisConnectionFailed = false;

const initRedisClient = async () => {
  if (!redisClient && !redisConnectionFailed) {
    try {
      const redisUrl = `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`;
      
      redisClient = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries >= 3) {
              logger.warn('Redis connection failed after 3 retries, disabling JWT blacklisting');
              redisConnectionFailed = true;
              return false;
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis connection error for auth middleware:', err);
        redisConnectionFailed = true;
      });
      
      redisClient.on('connect', () => {
        logger.info('Redis client connected for JWT blacklisting');
        redisConnectionFailed = false;
      });
      
      redisClient.on('ready', () => {
        logger.info('Redis client ready for JWT blacklisting');
      });
      
      await redisClient.connect();
      
    } catch (err) {
      logger.error('Failed to connect to Redis for JWT blacklisting:', err);
      redisConnectionFailed = true;
      redisClient = null;
    }
  }
  return redisClient;
};

// Initialize Redis client
initRedisClient();

// JWT Token blacklisting functions
const blacklistToken = async (token) => {
  try {
    if (redisConnectionFailed) {
      logger.warn('Redis unavailable, skipping token blacklisting');
      return false;
    }
    
    const client = await initRedisClient();
    if (client && client.isOpen) {
      // Decode token to get expiry time
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          // Store token hash instead of full token for security
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
          await client.setEx(`blacklist:${tokenHash}`, ttl, 'true');
          logger.info('Token blacklisted successfully');
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    logger.error('Error blacklisting token:', error);
    redisConnectionFailed = true;
    return false;
  }
};

const isTokenBlacklisted = async (token) => {
  try {
    if (redisConnectionFailed) {
      logger.warn('Redis unavailable, skipping blacklist check');
      return false; // Fail open when Redis is unavailable
    }
    
    const client = await initRedisClient();
    if (client && client.isOpen) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await client.get(`blacklist:${tokenHash}`);
      return result === 'true';
    }
    return false;
  } catch (error) {
    logger.error('Error checking token blacklist:', error);
    redisConnectionFailed = true;
    return false; // Fail open for availability
  }
};

// Service authentication token for internal service communication
const SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'internal-service-token';

// Enhanced permission mapping for MSSP roles
// Simplified permission mapping for clean RBAC
const ROLE_PERMISSIONS = {
  super_admin: {
    // Full system access - can do everything
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
  },
  admin: {
    // Organization admin - full access within their org
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
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: true,
    canExportData: true,
    canViewAuditLogs: true,
    canManageSystemSettings: false,
    canAccessApi: true,
    canCreateOrganizations: false,
    canDeleteOrganizations: false,
    canManageAllUsers: false,
    canImpersonateUsers: false,
    canViewSystemLogs: false,
    canManageApiKeys: false,
    canManageLicenses: false,
    canConfigureGlobalSettings: false,
    canManageBackups: false,
    canAccessDeveloperTools: false,
    canManageCompliance: true,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: true,
    canCloseIncidents: true
  },
  analyst: {
    // Can run extractions and analysis
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
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: false,
    canExportData: true,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canAccessApi: false,
    canCreateOrganizations: false,
    canDeleteOrganizations: false,
    canManageAllUsers: false,
    canImpersonateUsers: false,
    canViewSystemLogs: false,
    canManageApiKeys: false,
    canManageLicenses: false,
    canConfigureGlobalSettings: false,
    canManageBackups: false,
    canAccessDeveloperTools: false,
    canManageCompliance: true,
    canCreateIncidents: true,
    canManageIncidents: true,
    canEscalateIncidents: true,
    canCloseIncidents: false
  },
  viewer: {
    // Read-only access
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
    canAccessApi: false,
    canCreateOrganizations: false,
    canDeleteOrganizations: false,
    canManageAllUsers: false,
    canImpersonateUsers: false,
    canViewSystemLogs: false,
    canManageApiKeys: false,
    canManageLicenses: false,
    canConfigureGlobalSettings: false,
    canManageBackups: false,
    canAccessDeveloperTools: false,
    canManageCompliance: false,
    canCreateIncidents: false,
    canManageIncidents: false,
    canEscalateIncidents: false,
    canCloseIncidents: false
  }
};

// Authenticate JWT token (with secure service token validation)
const authenticateToken = async (req, res, next) => {
  try {
    // Check for service token first (for internal service communication)
    const serviceToken = req.headers['x-service-token'];
    
    // Secure service token validation - don't log token values
    if (serviceToken && process.env.SERVICE_AUTH_TOKEN) {
      // Use timing-safe comparison to prevent timing attacks
      const expectedToken = process.env.SERVICE_AUTH_TOKEN;
      if (serviceToken.length === expectedToken.length && 
          crypto.timingSafeEqual(Buffer.from(serviceToken), Buffer.from(expectedToken))) {
        
        // Service token authenticated - set specific service user context
        logger.info('Internal service request authenticated');
        req.isServiceRequest = true;
        req.userId = 'service'; // Special service user identifier
        req.userRole = 'service';
        req.organizationId = req.headers['x-organization-id'] || 'system';
        
        // Validate that this is actually an internal service request
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Handle IPv6-mapped IPv4 addresses (::ffff:xxx.xxx.xxx.xxx)
        const normalizedIP = clientIP.startsWith('::ffff:') ? clientIP.substring(7) : clientIP;
        
        const isInternalRequest = normalizedIP === '127.0.0.1' || 
                                clientIP === '::1' || 
                                normalizedIP.startsWith('172.') || 
                                normalizedIP.startsWith('10.') ||
                                normalizedIP.startsWith('192.168.');
        
        if (!isInternalRequest) {
          logger.warn(`Service token used from external IP: ${clientIP}`, {
            ip: clientIP,
            userAgent: req.get('User-Agent'),
            path: req.path
          });
          return res.status(403).json({ error: 'Service token not allowed from external networks' });
        }
        
        return next();
      } else {
        logger.warn('Invalid service token provided', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        return res.status(401).json({ error: 'Invalid service token' });
      }
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(403).json({ error: 'Token has been revoked' });
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
      
      // Handle organization context for multi-organization users
      // Check if organizationId is provided in query params (for filtering)
      const requestedOrgId = req.query.organizationId || req.headers['x-organization-id'];
      
      if (requestedOrgId) {
        // Super admins and admins can access any organization
        const isSuperAdmin = user.role === 'admin' || user.role === 'super_admin';
        
        if (isSuperAdmin) {
          req.organizationId = requestedOrgId;
          req.isCrossOrganizationAccess = requestedOrgId !== user.organization_id;
        } else {
          // Verify user has access to the requested organization
          try {
            const hasAccess = await getRow(
              'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
              [user.id, requestedOrgId]
            );
            
            if (hasAccess) {
              req.organizationId = requestedOrgId;
            } else {
              logger.warn(`User ${user.id} attempted to access organization ${requestedOrgId} without permission`);
              return res.status(403).json({ error: 'Access denied to requested organization' });
            }
          } catch (dbError) {
            logger.error('Error checking organization access:', dbError);
            // Fall back to user's primary organization on DB error
            req.organizationId = user.organization_id;
          }
        }
      } else {
        // Default to user's primary organization
        req.organizationId = user.organization_id;
      }
      
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

    // Get user's stored permissions
    const userPermissions = req.user.permissions || {};
    
    // Also check role-based permissions as fallback
    const userRole = req.user.role;
    const rolePermissions = ROLE_PERMISSIONS[userRole] || {};
    
    // Check if user has permission either from stored permissions or role
    const hasPermission = userPermissions[permission] || rolePermissions[permission];
    
    if (!hasPermission) {
      logger.warn(`User ${req.user.id} (role: ${userRole}) attempted to access ${permission} without permission`);
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

// Super admin access control - for cross-organization operations
const requireSuperAdmin = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isSuperAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    
    if (!isSuperAdmin) {
      logger.warn(`User ${req.user.id} with role ${req.user.role} attempted to access super admin resource`);
      return res.status(403).json({ error: 'Super admin access required' });
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
        crypto.randomUUID(),
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
  requireSuperAdmin,
  auditLog,
  blacklistToken,
  ROLE_PERMISSIONS
};
