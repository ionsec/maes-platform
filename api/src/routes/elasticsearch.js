const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const elasticsearchService = require('../services/elasticsearch');
const { logger } = require('../utils/logger');

const router = express.Router();

// Search audit logs
router.get('/search/audit-logs',
  authenticateToken,
  requireRole(['admin', 'analyst']),
  [
    query('q').optional().isString().withMessage('Query must be a string'),
    query('organization_id').optional().isUUID().withMessage('Invalid organization ID'),
    query('category').optional().isString().withMessage('Category must be a string'),
    query('start_date').optional().isISO8601().withMessage('Start date must be ISO 8601 format'),
    query('end_date').optional().isISO8601().withMessage('End date must be ISO 8601 format'),
    query('size').optional().isInt({ min: 1, max: 1000 }).withMessage('Size must be between 1 and 1000'),
    query('from').optional().isInt({ min: 0 }).withMessage('From must be a non-negative integer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        q = '',
        organization_id,
        category,
        start_date,
        end_date,
        size = 100,
        from = 0
      } = req.query;

      const filters = {};
      
      if (organization_id) {
        filters.organization_id = organization_id;
      }
      
      if (category) {
        filters.category = category;
      }
      
      if (start_date || end_date) {
        filters.date_range = {
          start: start_date || '1970-01-01',
          end: end_date || new Date().toISOString()
        };
      }

      const results = await elasticsearchService.searchAuditLogs(q, filters, parseInt(size), parseInt(from));

      res.json({
        success: true,
        data: results.hits,
        total: results.total,
        took: results.took,
        pagination: {
          from: parseInt(from),
          size: parseInt(size),
          total: results.total
        }
      });

    } catch (error) {
      logger.error('Search audit logs error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Search alerts
router.get('/search/alerts',
  authenticateToken,
  requireRole(['admin', 'analyst']),
  [
    query('q').optional().isString().withMessage('Query must be a string'),
    query('organization_id').optional().isUUID().withMessage('Invalid organization ID'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    query('status').optional().isIn(['new', 'acknowledged', 'investigating', 'resolved', 'false_positive']).withMessage('Invalid status'),
    query('start_date').optional().isISO8601().withMessage('Start date must be ISO 8601 format'),
    query('end_date').optional().isISO8601().withMessage('End date must be ISO 8601 format'),
    query('size').optional().isInt({ min: 1, max: 1000 }).withMessage('Size must be between 1 and 1000'),
    query('from').optional().isInt({ min: 0 }).withMessage('From must be a non-negative integer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        q = '',
        organization_id,
        severity,
        status,
        start_date,
        end_date,
        size = 100,
        from = 0
      } = req.query;

      const filters = {};
      
      if (organization_id) {
        filters.organization_id = organization_id;
      }
      
      if (severity) {
        filters.severity = severity;
      }
      
      if (status) {
        filters.status = status;
      }
      
      if (start_date || end_date) {
        filters.date_range = {
          start: start_date || '1970-01-01',
          end: end_date || new Date().toISOString()
        };
      }

      const results = await elasticsearchService.searchAlerts(q, filters, parseInt(size), parseInt(from));

      res.json({
        success: true,
        data: results.hits,
        total: results.total,
        took: results.took,
        pagination: {
          from: parseInt(from),
          size: parseInt(size),
          total: results.total
        }
      });

    } catch (error) {
      logger.error('Search alerts error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get analytics
router.get('/analytics',
  authenticateToken,
  requireRole(['admin', 'analyst']),
  [
    query('organization_id').isUUID().withMessage('Organization ID is required'),
    query('start_date').isISO8601().withMessage('Start date must be ISO 8601 format'),
    query('end_date').isISO8601().withMessage('End date must be ISO 8601 format')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { organization_id, start_date, end_date } = req.query;

      const analytics = await elasticsearchService.getAnalytics(organization_id, {
        start: start_date,
        end: end_date
      });

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Analytics error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Index management
router.post('/indices/reindex',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      // This would trigger a full reindex of data from PostgreSQL
      // Implementation depends on your data volume and requirements
      res.json({
        success: true,
        message: 'Reindex job started'
      });
    } catch (error) {
      logger.error('Reindex error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router; 