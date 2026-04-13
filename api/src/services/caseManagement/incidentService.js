const { pool } = require('../database');
const { logger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Case Management - Incident Response System
 * Groups related alerts into incidents, tracks investigation, manages evidence
 */

class IncidentService {
  /**
   * Create new incident from alerts
   */
  static async createIncident(data) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const incidentId = uuidv4();
      const { 
        title, 
        description, 
        severity, 
        organizationId, 
        alertIds = [],
        assignedTo,
        source,
        metadata = {}
      } = data;

      // Create incident record
      const incidentResult = await client.query(
        `INSERT INTO maes.incidents 
         (id, title, description, severity, status, organization_id, assigned_to, source, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'new', $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [incidentId, title, description, severity, organizationId, assignedTo, source, JSON.stringify(metadata)]
      );

      // Link alerts to incident
      for (const alertId of alertIds) {
        await client.query(
          `UPDATE maes.alerts 
           SET incident_id = $1, status = 'investigating', updated_at = NOW()
           WHERE id = $2 AND organization_id = $3`,
          [incidentId, alertId, organizationId]
        );
      }

      // Create timeline entry
      await client.query(
        `INSERT INTO maes.incident_timeline 
         (incident_id, organization_id, event_type, event_data, user_id, created_at)
         VALUES ($1, $2, 'incident_created', $3, NULL, NOW())`,
        [incidentId, organizationId, JSON.stringify({ message: `Incident created: ${title}`, severity })]
      );

      await client.query('COMMIT');
      
      logger.info(`Created incident ${incidentId}`, { title, severity, alertCount: alertIds.length });
      return incidentResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating incident:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get incident by ID
   */
  static async getIncident(incidentId, organizationId) {
    try {
      const result = await pool.query(
        `SELECT i.*, 
                u.username as assigned_to_username,
                u.email as assigned_to_email,
                array_agg(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL) as alert_ids
         FROM maes.incidents i
         LEFT JOIN maes.users u ON i.assigned_to = u.id
         LEFT JOIN maes.alerts a ON i.id = a.incident_id
         WHERE i.id = $1 AND i.organization_id = $2
         GROUP BY i.id, u.username, u.email`,
        [incidentId, organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const incident = result.rows[0];
      
      // Get timeline entries
      incident.timeline = await this.getTimeline(incidentId, organizationId);
      
      // Get evidence items
      incident.evidence = await this.getEvidence(incidentId, organizationId);

      return incident;
    } catch (error) {
      logger.error('Error getting incident:', error);
      throw error;
    }
  }

  /**
   * Update incident status
   */
  static async updateStatus(incidentId, organizationId, status, userId, notes = '') {
    try {
      const validStatuses = ['new', 'investigating', 'contained', 'resolved', 'closed'];
      
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Get previous status before updating
      const previousResult = await pool.query(
        `SELECT status FROM maes.incidents WHERE id = $1 AND organization_id = $2`,
        [incidentId, organizationId]
      );
      const previousStatus = previousResult.rows[0]?.status;

      const result = await pool.query(
        `UPDATE maes.incidents 
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING *`,
        [status, incidentId, organizationId]
      );

      // Add timeline entry
      await this.addTimelineEntry(incidentId, organizationId, 'status_change', {
        message: `Status changed to ${status}`,
        previous_status: previousStatus,
        new_status: status,
        notes
      }, userId);

      logger.info(`Updated incident ${incidentId} status to ${status}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating incident status:', error);
      throw error;
    }
  }

  /**
   * Assign incident to user
   */
  static async assignIncident(incidentId, organizationId, assignedTo, userId) {
    try {
      const result = await pool.query(
        `UPDATE maes.incidents 
         SET assigned_to = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING *`,
        [assignedTo, incidentId, organizationId]
      );

      // Add timeline entry
      await this.addTimelineEntry(incidentId, organizationId, 'assignment', {
        message: `Incident assigned to user ${assignedTo}`,
        assigned_by: userId
      }, userId);

      return result.rows[0];
    } catch (error) {
      logger.error('Error assigning incident:', error);
      throw error;
    }
  }

  /**
   * Add evidence to incident
   */
  static async addEvidence(incidentId, organizationId, evidenceData) {
    try {
      const evidenceId = uuidv4();
      const { type, name, description, hash, storage_path, metadata = {} } = evidenceData;

      const result = await pool.query(
        `INSERT INTO maes.incident_evidence 
         (id, incident_id, organization_id, type, name, description, hash, storage_path, metadata, collected_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [evidenceId, incidentId, organizationId, type, name, description, hash, storage_path, JSON.stringify(metadata)]
      );

      // Add timeline entry
      await this.addTimelineEntry(incidentId, organizationId, 'evidence_added', {
        message: `Evidence added: ${name}`,
        type,
        evidence_id: evidenceId
      });

      logger.info(`Added evidence ${evidenceId} to incident ${incidentId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }

  /**
   * Get evidence for incident
   */
  static async getEvidence(incidentId, organizationId) {
    try {
      const result = await pool.query(
        `SELECT * FROM maes.incident_evidence
         WHERE incident_id = $1 AND organization_id = $2
         ORDER BY created_at ASC`,
        [incidentId, organizationId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting evidence:', error);
      return [];
    }
  }

  /**
   * Add timeline entry
   */
  static async addTimelineEntry(incidentId, organizationId, eventType, eventData, userId = null) {
    try {
      await pool.query(
        `INSERT INTO maes.incident_timeline 
         (incident_id, organization_id, event_type, event_data, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [incidentId, organizationId, eventType, JSON.stringify(eventData), userId]
      );
    } catch (error) {
      logger.error('Error adding timeline entry:', error);
      throw error;
    }
  }

  /**
   * Get timeline for incident
   */
  static async getTimeline(incidentId, organizationId) {
    try {
      const result = await pool.query(
        `SELECT t.*, u.username, u.email
         FROM maes.incident_timeline t
         LEFT JOIN maes.users u ON t.user_id = u.id
         WHERE t.incident_id = $1 AND t.organization_id = $2
         ORDER BY t.created_at ASC`,
        [incidentId, organizationId]
      );

      return result.rows.map(row => ({
        ...row,
        event_data: typeof row.event_data === 'string' ? JSON.parse(row.event_data) : row.event_data
      }));
    } catch (error) {
      logger.error('Error getting timeline:', error);
      return [];
    }
  }

  /**
   * List incidents with filtering
   */
  static async listIncidents(organizationId, filters = {}, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const conditions = ['i.organization_id = $1'];
      const values = [organizationId];
      let paramIndex = 2;

      if (filters.status) {
        conditions.push(`i.status = $${paramIndex}`);
        values.push(filters.status);
        paramIndex++;
      }

      if (filters.severity) {
        conditions.push(`i.severity = $${paramIndex}`);
        values.push(filters.severity);
        paramIndex++;
      }

      if (filters.assignedTo) {
        conditions.push(`i.assigned_to = $${paramIndex}`);
        values.push(filters.assignedTo);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get incidents
      const incidentsResult = await pool.query(
        `SELECT i.*, 
                u.username as assigned_to_username,
                COUNT(a.id) as alert_count
         FROM maes.incidents i
         LEFT JOIN maes.users u ON i.assigned_to = u.id
         LEFT JOIN maes.alerts a ON i.id = a.incident_id
         WHERE ${whereClause}
         GROUP BY i.id, u.username, u.email
         ORDER BY i.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM maes.incidents WHERE ${whereClause}`,
        values
      );

      return {
        incidents: incidentsResult.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          total_pages: Math.ceil(countResult.rows[0].count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing incidents:', error);
      throw error;
    }
  }

  /**
   * Get incident statistics
   */
  static async getStatistics(organizationId) {
    try {
      const stats = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'new') as new,
          COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
          COUNT(*) FILTER (WHERE status = 'contained') as contained,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE severity = 'high') as high,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium,
          COUNT(*) FILTER (WHERE severity = 'low') as low,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status IN ('resolved', 'closed')) as avg_resolution_time_seconds
         FROM maes.incidents
         WHERE organization_id = $1`,
        [organizationId]
      );

      return stats.rows[0];
    } catch (error) {
      logger.error('Error getting incident statistics:', error);
      throw error;
    }
  }
}

module.exports = IncidentService;
