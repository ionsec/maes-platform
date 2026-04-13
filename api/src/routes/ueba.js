const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const UebaService = require('../services/ueba');
const UserBehaviorProfile = require('../services/ueba/userBehaviorProfile');
const { pool } = require('../services/database');

const router = express.Router();

router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * Get user behavior baseline
 */
router.get('/baseline/:userId', 
  requirePermission('canManageAlerts'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const baseline = await UserBehaviorProfile.getBaseline(userId, req.organizationId);
      
      res.json({
        success: true,
        baseline
      });
    } catch (error) {
      logger.error('Error getting UEBA baseline:', error);
      res.status(500).json({ error: 'Failed to get baseline' });
    }
  }
);

/**
 * Get user risk score
 */
router.get('/risk/:userId', 
  requirePermission('canManageAlerts'),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const riskScore = await UebaService.getUserRiskScore(userId, req.organizationId);
      
      res.json({
        success: true,
        riskScore
      });
    } catch (error) {
      logger.error('Error getting user risk score:', error);
      res.status(500).json({ error: 'Failed to get risk score' });
    }
  }
);

/**
 * Get all user baselines for organization
 */
router.get('/baselines', 
  requirePermission('canManageSystemSettings'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT b.*, u.username, u.email,
                COUNT(*) OVER() as total_count
         FROM maes.ueba_baselines b
         JOIN maes.users u ON b.user_id = u.id
         WHERE b.organization_id = $1 AND b.is_active = true
         ORDER BY b.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [req.organizationId, limit, offset]
      );

      const baselines = result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        email: row.email,
        baseline_data: row.baseline_data,
        confidence_level: row.baseline_data?.confidence_level,
        risk_score: row.baseline_data?.risk_score,
        updated_at: row.updated_at
      }));

      const total = result.rows[0]?.total_count || 0;

      res.json({
        success: true,
        baselines,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error listing baselines:', error);
      res.status(500).json({ error: 'Failed to list baselines' });
    }
  }
);

/**
 * Process activity for anomaly detection
 */
router.post('/process-activity', 
  requirePermission('canManageAlerts'),
  [
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('activity').isObject().withMessage('Activity data is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { userId, activity } = req.body;
      
      const result = await UebaService.processActivity({
        user_id: userId,
        organization_id: req.organizationId,
        ...activity
      });

      // Create alert if high risk detected
      if (result.total_risk_score >= 70) {
        try {
          const { v4: alertUuid } = require('uuid');
          await pool.query(
            `INSERT INTO maes.alerts (id, organization_id, severity, type, category, title, description, status, source, metadata, created_at, updated_at)
             VALUES ($1, $2, 'high', 'ueba_anomaly', 'behavioral', $3, $4, 'new', 'ueba', $5, NOW(), NOW())`,
            [
              alertUuid(),
              req.organizationId,
              'High-Risk User Activity Detected',
              `UEBA detected ${result.anomalies.length} anomalies with risk score ${result.total_risk_score}`,
              JSON.stringify({ userId, anomalies: result.anomalies, recommendation: result.recommendation })
            ]
          );
        } catch (alertError) {
          logger.warn('Failed to create UEBA alert:', alertError.message);
        }
      }

      res.json({
        success: true,
        result
      });
    } catch (error) {
      logger.error('Error processing UEBA activity:', error);
      res.status(500).json({ error: 'Failed to process activity' });
    }
  }
);

/**
 * Get UEBA statistics
 */
router.get('/stats', 
  requirePermission('canManageAlerts'),
  async (req, res) => {
    try {
      const stats = await pool.query(
        `SELECT 
          COUNT(*) as total_baselines,
          COUNT(*) FILTER (WHERE baseline_data->>'confidence_level' >= '70') as high_confidence,
          COUNT(*) FILTER (WHERE (baseline_data->>'risk_score')::int >= 40) as elevated_risk,
          AVG((baseline_data->>'risk_score')::int) as avg_risk_score,
          AVG((baseline_data->>'confidence_level')::int) as avg_confidence
         FROM maes.ueba_baselines
         WHERE organization_id = $1 AND is_active = true`,
        [req.organizationId]
      );

      res.json({
        success: true,
        stats: stats.rows[0]
      });
    } catch (error) {
      logger.error('Error getting UEBA stats:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  }
);

module.exports = router;
