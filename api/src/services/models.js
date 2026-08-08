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
    // Whitelist of allowed fields to prevent SQL injection
    // Whitelist of allowed fields to prevent SQL injection. NOTE: privileged
    // fields (role, permissions, organizationId, isActive) remain here because
    // the admin user-management routes legitimately set them through this method.
    // They must never be reachable from a self-service profile update — that is
    // enforced at the route layer via an explicit allowlist (routes/user.js).
    const allowedFields = [
      'username', 'email', 'firstName', 'lastName', 'phone', 'organization',
      'department', 'jobTitle', 'location', 'bio', 'profilePicture',
      'preferences', 'isActive', 'organizationId', 'role', 'permissions',
      'mfaEnabled', 'mfaSecret'
    ];
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        // Convert camelCase to snake_case and validate against whitelist
        const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        const camelField = key;
        
        // Check if field is allowed (either camelCase or snake_case)
        if (allowedFields.includes(camelField) || allowedFields.includes(dbField)) {
          fields.push(`${dbField} = $${paramCount}`);
          
          // Handle JSON fields properly
          let value = updates[key];
          if ((key === 'permissions' || key === 'preferences') && typeof value === 'object') {
            value = JSON.stringify(value);
          }
          
          values.push(value);
          paramCount++;
        } else {
          // Log potential SQL injection attempt
          console.warn(`Blocked potential SQL injection attempt: field '${key}' not in whitelist`);
        }
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

  // Check if organization is properly configured for extractions
  isConfiguredForExtractions: (organization) => {
    if (!organization) return false;
    if (!organization.is_active) return false;
    if (!organization.tenant_id) return false;
    
    const credentials = organization.credentials || {};
    
    // Must have applicationId
    if (!credentials.applicationId) return false;
    
    // Must have either certificateThumbprint OR clientSecret for authentication
    // Note: clientSecret can be "0" which is falsy but valid
    const hasCertAuth = credentials.certificateThumbprint;
    const hasSecretAuth = credentials.clientSecret !== undefined && credentials.clientSecret !== null;
    
    if (!hasCertAuth && !hasSecretAuth) return false;
    
    return true;
  },

  // Get configuration status with detailed information
  getConfigurationStatus: (organization) => {
    if (!organization) {
      return {
        isConfigured: false,
        missingRequirements: ['Organization not found'],
        canRunExtractions: false
      };
    }

    const missingRequirements = [];
    
    if (!organization.is_active) {
      missingRequirements.push('Organization is inactive');
    }
    
    if (!organization.tenant_id) {
      missingRequirements.push('Tenant ID not configured');
    }
    
    if (!organization.fqdn) {
      missingRequirements.push('Organization domain (FQDN) not configured');
    }
    
    const credentials = organization.credentials || {};
    
    // Check for applicationId (always required)
    if (!credentials.applicationId) {
      missingRequirements.push('Missing credential: applicationId');
    }
    
    // Check for authentication method (need either certificate or client secret)
    // Note: clientSecret can be "0" which is falsy but valid
    const hasCertAuth = credentials.certificateThumbprint;
    const hasSecretAuth = credentials.clientSecret !== undefined && credentials.clientSecret !== null;
    
    if (!hasCertAuth && !hasSecretAuth) {
      missingRequirements.push('Missing authentication method: need either certificateThumbprint or clientSecret');
    }

    return {
      isConfigured: missingRequirements.length === 0,
      missingRequirements,
      canRunExtractions: missingRequirements.length === 0
    };
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map camelCase to snake_case for database columns
    const fieldMapping = {
      name: 'name',
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
    
    try {
      return await update(query, values);
    } catch (error) {
      // Handle unique constraint violations
      if (error.code === '23505') { // PostgreSQL unique violation error code
        if (error.constraint === 'organizations_tenant_id_key') {
          throw new Error('Tenant ID already exists for another organization');
        }
        throw new Error('Duplicate value: ' + error.detail);
      }
      throw error;
    }
  },

  findByPk: async (id) => {
    return await getRow('SELECT * FROM maes.organizations WHERE id = $1', [id]);
  },
  
  delete: async (id) => {
    const query = 'DELETE FROM maes.organizations WHERE id = $1 RETURNING *';
    return await remove(query, [id]);
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
  },

  countByOrganization: async (organizationId, filters = {}) => {
    let whereClause = 'WHERE organization_id = $1';
    const values = [organizationId];
    let paramCount = 2;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        const statusPlaceholders = filters.status.map((_, i) => `$${paramCount + i}`).join(', ');
        whereClause += ` AND status IN (${statusPlaceholders})`;
        values.push(...filters.status);
        paramCount += filters.status.length;
      } else {
        whereClause += ` AND status = $${paramCount}`;
        values.push(filters.status);
        paramCount++;
      }
    }

    const query = `
      SELECT COUNT(*) FROM maes.extractions 
      ${whereClause}
    `;
    
    return await count(query, values);
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

  /**
   * @param {string} organizationId
   * @param {Object} [filters] - status, severity, category, unread
   * @param {number} [page]
   * @param {number} [limit]
   * @param {string} [userId] - resolves per-user read state; omit and every
   *   alert comes back with read = false
   */
  findAll: async (organizationId, filters = {}, page = 1, limit = 20, userId = null) => {
    let whereClause = 'WHERE a.organization_id = $1';
    const values = [organizationId];
    let paramCount = 2;

    if (filters.status) {
      whereClause += ` AND a.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.severity) {
      whereClause += ` AND a.severity = $${paramCount}`;
      values.push(filters.severity);
      paramCount++;
    }

    // Previously accepted by the route and then silently ignored here, so
    // filtering by category appeared to work but returned everything.
    if (filters.category) {
      whereClause += ` AND a.category = $${paramCount}`;
      values.push(filters.category);
      paramCount++;
    }

    // Read state is per user. Without one, nothing is marked read.
    const readJoin = userId
      ? `LEFT JOIN maes.alert_reads r ON r.alert_id = a.id AND r.user_id = $${paramCount}`
      : '';
    const readSelect = userId ? '(r.alert_id IS NOT NULL)' : 'false';
    if (userId) {
      values.push(userId);
      paramCount++;
    }

    if (filters.unread === true && userId) {
      whereClause += ' AND r.alert_id IS NULL';
    }

    const offset = (page - 1) * limit;
    const query = `
      SELECT a.*, ${readSelect} AS read
      FROM maes.alerts a
      ${readJoin}
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    values.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count
      FROM maes.alerts a
      ${readJoin}
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

  /**
   * Mark one alert read for one user. Idempotent, and scoped to the
   * organization so a user cannot mark an alert they cannot see.
   * @returns {boolean} whether the alert exists in that organization
   */
  markRead: async (alertId, userId, organizationId) => {
    const result = await query(
      `INSERT INTO maes.alert_reads (alert_id, user_id)
       SELECT a.id, $2 FROM maes.alerts a
        WHERE a.id = $1 AND a.organization_id = $3
       ON CONFLICT (alert_id, user_id) DO NOTHING`,
      [alertId, userId, organizationId]
    );

    // ON CONFLICT DO NOTHING reports zero rows for an alert that was already
    // read, so confirm existence separately rather than returning a false 404.
    if (result.rowCount > 0) return true;
    const existing = await getRow(
      'SELECT 1 FROM maes.alerts WHERE id = $1 AND organization_id = $2',
      [alertId, organizationId]
    );
    return Boolean(existing);
  },

  /** Un-mark an alert, so a user can put something back in their queue. */
  markUnread: async (alertId, userId) => {
    await query(
      'DELETE FROM maes.alert_reads WHERE alert_id = $1 AND user_id = $2',
      [alertId, userId]
    );
    return true;
  },

  /** Mark every alert in the organization read for this user. */
  markAllRead: async (userId, organizationId) => {
    const result = await query(
      `INSERT INTO maes.alert_reads (alert_id, user_id)
       SELECT a.id, $1 FROM maes.alerts a
        WHERE a.organization_id = $2
       ON CONFLICT (alert_id, user_id) DO NOTHING`,
      [userId, organizationId]
    );
    return result.rowCount;
  },

  /** Alerts in the organization this user has not read. */
  unreadCount: async (userId, organizationId) => {
    return count(
      `SELECT COUNT(*) as count
         FROM maes.alerts a
         LEFT JOIN maes.alert_reads r ON r.alert_id = a.id AND r.user_id = $1
        WHERE a.organization_id = $2 AND r.alert_id IS NULL`,
      [userId, organizationId]
    );
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

// Report model operations
const ReportModel = {
  create: async (data) => {
    const query = `
      INSERT INTO maes.reports (
        organization_id, created_by, name, type, format, parameters, schedule,
        status, file_path, file_name, error, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `;
    return await insert(query, [
      data.organizationId,
      data.createdBy,
      data.name,
      data.type,
      data.format,
      JSON.stringify(data.parameters || {}),
      JSON.stringify(data.schedule || {}),
      data.status || 'pending',
      data.filePath,
      data.fileName,
      data.error
    ]);
  },

  findById: async (id, organizationId) => {
    const query = `
      SELECT r.*, u.username as creator_username, u.first_name, u.last_name
      FROM maes.reports r
      LEFT JOIN maes.users u ON r.created_by = u.id
      WHERE r.id = $1 AND r.organization_id = $2
    `;
    return await getRow(query, [id, organizationId]);
  },

  listByOrganization: async (organizationId, { type, status, limit, offset }) => {
    const conditions = ['r.organization_id = $1'];
    const values = [organizationId];
    let paramIndex = 2;

    if (type) {
      conditions.push(`r.type = $${paramIndex}`);
      values.push(type);
      paramIndex++;
    }
    if (status) {
      conditions.push(`r.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const rows = await getRows(
      `SELECT r.*, u.username as creator_username, u.first_name, u.last_name
       FROM maes.reports r
       LEFT JOIN maes.users u ON r.created_by = u.id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    const total = await count(
      `SELECT COUNT(*) FROM maes.reports r WHERE ${whereClause}`,
      values
    );

    return { rows, total };
  },

  update: async (id, data) => {
    const query = `
      UPDATE maes.reports SET
        status = COALESCE($2, status),
        file_path = COALESCE($3, file_path),
        file_name = COALESCE($4, file_name),
        error = COALESCE($5, error),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    return await update(query, [id, data.status, data.filePath, data.fileName, data.error]);
  },

  remove: async (id, organizationId) => {
    const query = `
      DELETE FROM maes.reports
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `;
    return await remove(query, [id, organizationId]);
  }
};

// SIEM configuration model operations
const SiemConfigModel = {
  create: async (data) => {
    const query = `
      INSERT INTO maes.siem_configurations (
        organization_id, name, type, endpoint, api_key, format, enabled,
        export_frequency, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;
    return await insert(query, [
      data.organizationId,
      data.name,
      data.type,
      data.endpoint,
      data.apiKey,
      data.format || 'json',
      data.enabled !== false,
      data.exportFrequency || 'manual'
    ]);
  },

  listByOrganization: async (organizationId) => {
    const query = `
      SELECT * FROM maes.siem_configurations
      WHERE organization_id = $1
      ORDER BY created_at ASC
    `;
    return await getRows(query, [organizationId]);
  },

  findById: async (id, organizationId) => {
    const query = `
      SELECT * FROM maes.siem_configurations
      WHERE id = $1 AND organization_id = $2
    `;
    return await getRow(query, [id, organizationId]);
  },

  update: async (id, data) => {
    const query = `
      UPDATE maes.siem_configurations SET
        name = COALESCE($2, name),
        type = COALESCE($3, type),
        endpoint = COALESCE($4, endpoint),
        api_key = COALESCE($5, api_key),
        format = COALESCE($6, format),
        enabled = COALESCE($7, enabled),
        export_frequency = COALESCE($8, export_frequency),
        last_test_at = COALESCE($9, last_test_at),
        last_test_status = COALESCE($10, last_test_status),
        last_export_at = COALESCE($11, last_export_at),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    return await update(query, [
      id,
      data.name,
      data.type,
      data.endpoint,
      data.apiKey,
      data.format,
      data.enabled,
      data.exportFrequency,
      data.lastTestAt,
      data.lastTestStatus,
      data.lastExportAt
    ]);
  },

  remove: async (id, organizationId) => {
    const query = `
      DELETE FROM maes.siem_configurations
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `;
    return await remove(query, [id, organizationId]);
  }
};

module.exports = {
  User: UserModel,
  Organization: OrganizationModel,
  Extraction: ExtractionModel,
  AnalysisJob: AnalysisJobModel,
  Alert: AlertModel,
  AuditLog: AuditLogModel,
  Report: ReportModel,
  SiemConfig: SiemConfigModel
};