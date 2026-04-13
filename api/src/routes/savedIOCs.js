const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const { pool } = require('../services/database');

const router = express.Router();

router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * List saved IOCs
 */
router.get('/saved', 
  requirePermission('canAccessThreatIntel'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isIn(['ip', 'domain', 'hash']),
    query('risk_level').optional().isIn(['critical', 'high', 'medium', 'low', 'clean'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const conditions = ['organization_id = $1'];
      const values = [req.organizationId];
      let paramIndex = 2;

      if (req.query.type) {
        conditions.push(`type = $${paramIndex}`);
        values.push(req.query.type);
        paramIndex++;
      }

      if (req.query.risk_level) {
        conditions.push(`risk_level = $${paramIndex}`);
        values.push(req.query.risk_level);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const result = await pool.query(
        `SELECT * FROM maes.saved_iocs
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM maes.saved_iocs WHERE ${whereClause}`,
        values
      );

      res.json({
        success: true,
        iocs: result.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          total_pages: Math.ceil(countResult.rows[0].count / limit)
        }
      });
    } catch (error) {
      logger.error('Error listing saved IOCs:', error);
      res.status(500).json({ error: 'Failed to list saved IOCs' });
    }
  }
);

/**
 * Save a new IOC
 */
router.post('/saved',
  requirePermission('canAccessThreatIntel'),
  [
    body('value').isString().isLength({ min: 1 }).withMessage('IOC value is required'),
    body('type').isIn(['ip', 'domain', 'hash']).withMessage('Type must be ip, domain, or hash'),
    body('notes').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { value, type, notes } = req.body;

      const result = await pool.query(
        `INSERT INTO maes.saved_iocs (organization_id, value, type, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (organization_id, value) DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING *`,
        [req.organizationId, value, type, notes || null]
      );

      res.status(201).json({
        success: true,
        ioc: result.rows[0]
      });
    } catch (error) {
      logger.error('Error saving IOC:', error);
      res.status(500).json({ error: 'Failed to save IOC' });
    }
  }
);

/**
 * Delete a saved IOC
 */
router.delete('/saved/:id',
  requirePermission('canAccessThreatIntel'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM maes.saved_iocs WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [req.params.id, req.organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'IOC not found' });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting IOC:', error);
      res.status(500).json({ error: 'Failed to delete IOC' });
    }
  }
);

module.exports = router;
