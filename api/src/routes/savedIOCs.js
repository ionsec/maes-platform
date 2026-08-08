const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const { pool } = require('../services/database');
const iocEnrichment = require('../services/threatIntel/iocEnrichment');

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
 * Enrich a saved IOC and persist the verdict.
 *
 * The Saved IOCs table has risk_level, risk_score, enrichment_data and
 * last_enriched_at columns, but nothing ever wrote to them: the page called
 * the stateless /enrich endpoint and then re-read the table, so the Risk Level
 * column stayed "Not enriched" forever and those four columns were dead.
 */
router.post('/saved/:id/enrich',
  requirePermission('canAccessThreatIntel'),
  async (req, res) => {
    try {
      const existing = await pool.query(
        'SELECT id, value, type FROM maes.saved_iocs WHERE id = $1 AND organization_id = $2',
        [req.params.id, req.organizationId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'IOC not found' });
      }

      const ioc = existing.rows[0];
      let enrichment;

      switch (ioc.type) {
        case 'ip':
          enrichment = await iocEnrichment.enrichIP(ioc.value);
          break;
        case 'domain':
          enrichment = await iocEnrichment.enrichDomain(ioc.value);
          break;
        case 'hash':
          enrichment = await iocEnrichment.enrichHash(ioc.value);
          break;
        default:
          return res.status(400).json({ error: `Cannot enrich IOC of type '${ioc.type}'` });
      }

      // With no provider configured, enrichment returns a zero-score "clean"
      // result. Recording that as a verdict would assert something the
      // platform did not actually check, so the columns are left untouched and
      // the caller is told why.
      if (!enrichment.providers_checked || enrichment.providers_checked.length === 0) {
        return res.json({
          success: true,
          enriched: false,
          reason: 'No threat intelligence providers are configured, so no verdict was recorded.',
          ioc
        });
      }

      const updated = await pool.query(
        `UPDATE maes.saved_iocs
            SET risk_level = $1,
                risk_score = $2,
                enrichment_data = $3,
                last_enriched_at = NOW(),
                updated_at = NOW()
          WHERE id = $4 AND organization_id = $5
          RETURNING *`,
        [
          enrichment.risk_level,
          enrichment.risk_score,
          JSON.stringify(enrichment),
          ioc.id,
          req.organizationId
        ]
      );

      res.json({ success: true, enriched: true, ioc: updated.rows[0] });

    } catch (error) {
      logger.error('Error enriching saved IOC:', error);
      res.status(500).json({ error: 'Failed to enrich IOC' });
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
