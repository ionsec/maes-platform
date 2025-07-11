const bcrypt = require('bcryptjs');
const { getRow, getRows, insert, update, remove, count } = require('./database');
const { logger } = require('../utils/logger');

// User model operations
const UserModel = {
  // Find user by username or email
  findByUsernameOrEmail: async (username) => {
    const query = `
      SELECT u.*, o.name as organization_name, o.tenant_id, o.is_active as organization_active
      FROM maes.users u
      LEFT JOIN maes.organizations o ON u.organization_id = o.id
      WHERE u.username = $1 OR u.email = $1
    `;
    return await getRow(query, [username]);
  },

  // Find user by ID
  findById: async (id) => {
    const query = `
      SELECT u.*, o.name as organization_name, o.tenant_id, o.is_active as organization_active
      FROM maes.users u
      LEFT JOIN maes.organizations o ON u.organization_id = o.id
      WHERE u.id = $1
    `;
    return await getRow(query, [id]);
  },

  // Create new user
  create: async (userData) => {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const query = `
      INSERT INTO maes.users (
        organization_id, email, username, password, first_name, last_name, 
        role, permissions, mfa_enabled, mfa_secret, is_active, preferences
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    return await insert(query, [
      userData.organizationId,
      userData.email,
      userData.username,
      hashedPassword,
      userData.firstName,
      userData.lastName,
      userData.role || 'analyst',
      JSON.stringify(userData.permissions || {}),
      userData.mfaEnabled || false,
      userData.mfaSecret,
      userData.isActive !== false,
      JSON.stringify(userData.preferences || {})
    ]);
  },

  // Update user
  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE maes.users 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    return await update(query, values);
  },

  // Update login attempts
  updateLoginAttempts: async (id, attempts, lockedUntil = null) => {
    const query = `
      UPDATE maes.users 
      SET login_attempts = $2, locked_until = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    return await update(query, [id, attempts, lockedUntil]);
  },

  // Reset login attempts
  resetLoginAttempts: async (id) => {
    const query = `
      UPDATE maes.users 
      SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    return await update(query, [id]);
  },

  // Update password
  updatePassword: async (id, hashedPassword) => {
    const query = `
      UPDATE maes.users 
      SET password = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, email
    `;
    return await update(query, [id, hashedPassword]);
  },

  // Validate password
  validatePassword: async (id, password) => {
    const user = await getRow('SELECT password FROM maes.users WHERE id = $1', [id]);
    if (!user) return false;
    return await bcrypt.compare(password, user.password);
  }
};

// Organization model operations
const OrganizationModel = {
  findById: async (id) => {
    return await getRow('SELECT * FROM maes.organizations WHERE id = $1', [id]);
  },

  findByTenantId: async (tenantId) => {
    return await getRow('SELECT * FROM maes.organizations WHERE tenant_id = $1', [tenantId]);
  },

  create: async (orgData) => {
    const query = `
      INSERT INTO maes.organizations (
        name, tenant_id, fqdn, subscription_id, settings, credentials, is_active, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    return await insert(query, [
      orgData.name,
      orgData.tenantId,
      orgData.fqdn,
      orgData.subscriptionId,
      JSON.stringify(orgData.settings || {}),
      JSON.stringify(orgData.credentials || {}),
      orgData.isActive !== false,
      JSON.stringify(orgData.metadata || {})
    ]);
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map camelCase to snake_case for database columns
    const fieldMapping = {
      organizationName: 'name',
      tenantId: 'tenant_id',
      fqdn: 'fqdn',
      subscriptionId: 'subscription_id',
      organizationType: 'organization_type',
      subscriptionStatus: 'subscription_status',
      serviceTier: 'service_tier',
      settings: 'settings',
      credentials: 'credentials',
      isActive: 'is_active',
      metadata: 'metadata'
    };

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        const dbKey = fieldMapping[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
        
        if (['settings', 'credentials', 'metadata'].includes(dbKey)) {
          fields.push(`${dbKey} = $${paramCount}`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${dbKey} = $${paramCount}`);
          values.push(updates[key]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE maes.organizations 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    logger.info('Organization update query:', { query, values });
    return await update(query, values);
  },

  findByPk: async (id) => {
    return await getRow('SELECT * FROM maes.organizations WHERE id = $1', [id]);
  },

  count: async (conditions = {}) => {
    let whereClause = '';
    const values = [];
    let paramCount = 1;

    if (Object.keys(conditions).length > 0) {
      const clauses = [];
      Object.keys(conditions).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        clauses.push(`${dbKey} = $${paramCount}`);
        values.push(conditions[key]);
        paramCount++;
      });
      whereClause = ` WHERE ${clauses.join(' AND ')}`;
    }

    const query = `SELECT COUNT(*) as count FROM maes.organizations${whereClause}`;
    const result = await getRow(query, values);
    return parseInt(result.count);
  }
};

// Extraction model operations
const ExtractionModel = {
  findById: async (id, organizationId) => {
    const query = `
      SELECT * FROM maes.extractions 
      WHERE id = $1 AND organization_id = $2
    `;
    return await getRow(query, [id, organizationId]);
  },

  findAll: async (organizationId, filters = {}, page = 1, limit = 20) => {
    let whereClause = 'WHERE organization_id = $1';
    const values = [organizationId];
    let paramCount = 2;

    if (filters.status) {
      whereClause += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.type) {
      whereClause += ` AND type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    const offset = (page - 1) * limit;
    const query = `
      SELECT * FROM maes.extractions 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    values.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count FROM maes.extractions 
      ${whereClause}
    `;

    const [extractions, totalCount] = await Promise.all([
      getRows(query, values),
      count(countQuery, values.slice(0, -2))
    ]);

    return {
      extractions,
      pagination: {
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit),
        limit
      }
    };
  },

  create: async (extractionData) => {
    const query = `
      INSERT INTO maes.extractions (
        organization_id, type, status, priority, start_date, end_date,
        progress, parameters, triggered_by, is_scheduled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    return await insert(query, [
      extractionData.organizationId,
      extractionData.type,
      extractionData.status || 'pending',
      extractionData.priority || 'medium',
      extractionData.startDate,
      extractionData.endDate,
      extractionData.progress || 0,
      JSON.stringify(extractionData.parameters || {}),
      extractionData.triggeredBy,
      extractionData.isScheduled || false
    ]);
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Fields that should be stored as JSON
    const jsonFields = ['outputFiles', 'statistics', 'errorDetails', 'parameters'];

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${dbKey} = $${paramCount}`);
        
        // Convert to JSON for JSON fields
        if (jsonFields.includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE maes.extractions 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    return await update(query, values);
  }
};

// Analysis Job model operations
const AnalysisJobModel = {
  findById: async (id) => {
    return await getRow('SELECT * FROM maes.analysis_jobs WHERE id = $1', [id]);
  },

  findByExtractionId: async (extractionId) => {
    return await getRows('SELECT * FROM maes.analysis_jobs WHERE extraction_id = $1', [extractionId]);
  },

  create: async (jobData) => {
    const query = `
      INSERT INTO maes.analysis_jobs (
        extraction_id, organization_id, type, status, priority, progress, parameters
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const result = await insert(query, [
      jobData.extractionId,
      jobData.organizationId,
      jobData.type,
      jobData.status || 'pending',
      jobData.priority || 'medium',
      jobData.progress || 0,
      JSON.stringify(jobData.parameters || {})
    ]);
    
    // Add the original data back to the result for job creation
    if (result) {
      result.extractionId = jobData.extractionId;
      result.organizationId = jobData.organizationId;
    }
    
    return result;
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE maes.analysis_jobs 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    return await update(query, values);
  }
};

// Alert model operations
const AlertModel = {
  findById: async (id, organizationId) => {
    const query = `
      SELECT * FROM maes.alerts 
      WHERE id = $1 AND organization_id = $2
    `;
    return await getRow(query, [id, organizationId]);
  },

  findAll: async (organizationId, filters = {}, page = 1, limit = 20) => {
    let whereClause = 'WHERE organization_id = $1';
    const values = [organizationId];
    let paramCount = 2;

    if (filters.status) {
      whereClause += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.severity) {
      whereClause += ` AND severity = $${paramCount}`;
      values.push(filters.severity);
      paramCount++;
    }

    const offset = (page - 1) * limit;
    const query = `
      SELECT * FROM maes.alerts 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    values.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count FROM maes.alerts 
      ${whereClause}
    `;

    const [alerts, totalCount] = await Promise.all([
      getRows(query, values),
      count(countQuery, values.slice(0, -2))
    ]);

    return {
      alerts,
      pagination: {
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit),
        limit
      }
    };
  },

  create: async (alertData) => {
    const query = `
      INSERT INTO maes.alerts (
        organization_id, severity, type, category, title, description,
        status, source, affected_entities, evidence, mitre_attack,
        recommendations, tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    return await insert(query, [
      alertData.organizationId,
      alertData.severity,
      alertData.type,
      alertData.category || 'other',
      alertData.title,
      alertData.description,
      alertData.status || 'new',
      JSON.stringify(alertData.source || {}),
      JSON.stringify(alertData.affectedEntities || {}),
      JSON.stringify(alertData.evidence || {}),
      JSON.stringify(alertData.mitreAttack || {}),
      JSON.stringify(alertData.recommendations || []),
      alertData.tags || [],
      JSON.stringify(alertData.metadata || {})
    ]);
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE maes.alerts 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    return await update(query, values);
  }
};

// Audit Log model operations
const AuditLogModel = {
  create: async (logData) => {
    const query = `
      INSERT INTO maes.audit_logs (
        user_id, organization_id, action, category, resource, resource_id,
        ip_address, user_agent, request_method, request_path, status_code,
        duration, details, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    return await insert(query, [
      logData.userId,
      logData.organizationId,
      logData.action,
      logData.category,
      logData.resource,
      logData.resourceId,
      logData.ipAddress,
      logData.userAgent,
      logData.requestMethod,
      logData.requestPath,
      logData.statusCode,
      logData.duration,
      JSON.stringify(logData.details || {}),
      JSON.stringify(logData.metadata || {})
    ]);
  }
};

module.exports = {
  User: UserModel,
  Organization: OrganizationModel,
  Extraction: ExtractionModel,
  AnalysisJob: AnalysisJobModel,
  Alert: AlertModel,
  AuditLog: AuditLogModel
}; 