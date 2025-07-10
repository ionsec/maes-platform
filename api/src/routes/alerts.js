const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Alert, User, AuditLog } = require('../services/models');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

// Get alerts with pagination and filtering
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    query('status').optional().isIn(['new', 'acknowledged', 'investigating', 'resolved', 'false_positive']).withMessage('Invalid status'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    query('category').optional().isString().withMessage('Category must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const where = {};
      if (req.organizationId) {
        where.organizationId = req.organizationId;
      }
      
      if (req.query.status) where.status = req.query.status;
      if (req.query.severity) where.severity = req.query.severity;
      if (req.query.category) where.category = req.query.category;

      const result = await Alert.findAll(req.organizationId, where, page, limit);

      res.json({
        success: true,
        alerts: result.alerts,
        pagination: result.pagination
      });

    } catch (error) {
      logger.error('Get alerts error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get single alert
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id, req.organizationId);

    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      alert
    });

  } catch (error) {
    logger.error('Get alert error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Acknowledge alert
router.put('/:id/acknowledge', 
  requirePermission('canManageAlerts'),
  async (req, res) => {
    try {
      const alert = await Alert.findById(req.params.id, req.organizationId);

      if (!alert) {
        return res.status(404).json({
          error: 'Alert not found'
        });
      }

      if (alert.status !== 'new') {
        return res.status(400).json({
          error: 'Alert is already acknowledged or resolved'
        });
      }

      // Update alert
      await Alert.update(req.params.id, {
        status: 'acknowledged',
        acknowledgedBy: req.user.id,
        acknowledgedAt: new Date()
      });

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('alert.acknowledged', {
          id: alert.id,
          status: 'acknowledged',
          acknowledgedBy: req.user.id
        });
      }

      const updatedAlert = await Alert.findById(req.params.id, req.organizationId);
      res.json({
        success: true,
        alert: updatedAlert
      });

    } catch (error) {
      logger.error('Acknowledge alert error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Assign alert
router.put('/:id/assign', 
  requirePermission('canManageAlerts'),
  [
    body('assignedTo').isUUID().withMessage('Valid user ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { assignedTo } = req.body;

      const alert = await Alert.findById(req.params.id, req.organizationId);

      if (!alert) {
        return res.status(404).json({
          error: 'Alert not found'
        });
      }

      // Verify assigned user exists in same organization
      const assignedUser = await User.findById(assignedTo);

      if (!assignedUser || assignedUser.organization_id !== req.organizationId || !assignedUser.is_active) {
        return res.status(404).json({
          error: 'Assigned user not found'
        });
      }

      // Update alert
      const updateData = { assignedTo };
      if (alert.status === 'new') {
        updateData.status = 'investigating';
      }
      await Alert.update(req.params.id, updateData);

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('alert.assigned', {
          id: alert.id,
          assignedTo,
          status: updateData.status || alert.status
        });
      }

      const updatedAlert = await Alert.findById(req.params.id, req.organizationId);
      res.json({
        success: true,
        alert: updatedAlert
      });

    } catch (error) {
      logger.error('Assign alert error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Resolve alert
router.put('/:id/resolve', 
  requirePermission('canManageAlerts'),
  [
    body('resolutionNotes').optional().isString().withMessage('Resolution notes must be a string'),
    body('status').isIn(['resolved', 'false_positive']).withMessage('Status must be resolved or false_positive')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { resolutionNotes, status } = req.body;

      const alert = await Alert.findById(req.params.id, req.organizationId);

      if (!alert) {
        return res.status(404).json({
          error: 'Alert not found'
        });
      }

      if (alert.status === 'resolved' || alert.status === 'false_positive') {
        return res.status(400).json({
          error: 'Alert is already resolved'
        });
      }

      // Update alert
      const updateData = {
        status,
        resolvedBy: req.user.id,
        resolvedAt: new Date()
      };
      if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
      await Alert.update(req.params.id, updateData);

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('alert.resolved', {
          id: alert.id,
          status: status,
          resolvedBy: req.user.id
        });
      }

      const updatedAlert = await Alert.findById(req.params.id, req.organizationId);
      res.json({
        success: true,
        alert: updatedAlert
      });

    } catch (error) {
      logger.error('Resolve alert error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Create new alert (internal service endpoint)
router.post('/',
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    body('source').notEmpty().withMessage('Source is required'),
    body('organizationId').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
    body('analysisId').optional().isUUID().withMessage('Analysis ID must be a valid UUID'),
    body('extractionId').optional().isUUID().withMessage('Extraction ID must be a valid UUID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        title,
        description,
        severity,
        source,
        status = 'new',
        organizationId,
        analysisId,
        extractionId,
        data = {}
      } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      const alert = await Alert.create({
        organizationId,
        title,
        description,
        severity,
        type: data.finding?.type || 'general',
        category: data.finding?.category || 'other',
        status,
        source: data.finding?.source || source,
        affectedEntities: data.finding?.affectedEntities || data.affectedEntities || {
          users: [],
          resources: [],
          applications: [],
          ipAddresses: []
        },
        evidence: data.finding?.evidence || data.evidence || {
          events: [],
          indicators: [],
          context: {}
        },
        mitreAttack: data.finding?.mitreAttack || data.mitreAttack || {
          tactics: [],
          techniques: [],
          subTechniques: []
        },
        recommendations: data.finding?.recommendations || data.recommendations || [],
        tags: data.finding?.tags || [],
        metadata: {
          analysisId,
          extractionId,
          ...data
        }
      });

      logger.info(`Alert created: ${title} (${severity})`);

      res.status(201).json({
        success: true,
        alert
      });

    } catch (error) {
      logger.error('Create alert error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get alert statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { getRows } = require('../services/database');
    
    const stats = await getRows(`
      SELECT severity, status, COUNT(*) as count 
      FROM maes.alerts 
      WHERE organization_id = $1 
      GROUP BY severity, status
    `, [req.organizationId]);

    // Transform to more usable format
    const summary = {
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byStatus: { new: 0, acknowledged: 0, investigating: 0, resolved: 0, false_positive: 0 },
      total: 0
    };

    stats.forEach(stat => {
      summary.bySeverity[stat.severity] = (summary.bySeverity[stat.severity] || 0) + parseInt(stat.count);
      summary.byStatus[stat.status] = (summary.byStatus[stat.status] || 0) + parseInt(stat.count);
      summary.total += parseInt(stat.count);
    });

    res.json({
      success: true,
      stats: summary
    });

  } catch (error) {
    logger.error('Get alert stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete alert
router.delete('/:id', 
  requirePermission('canManageAlerts'),
  async (req, res) => {
    try {
      const alert = await Alert.findById(req.params.id, req.organizationId);

      if (!alert) {
        return res.status(404).json({
          error: 'Alert not found'
        });
      }

      const { remove } = require('../services/database');
      await remove('DELETE FROM maes.alerts WHERE id = $1', [req.params.id]);

      // Log deletion action
      await AuditLog.create({
        userId: req.user.id,
        organizationId: req.organizationId,
        action: 'alert_deleted',
        category: 'alert_management',
        resource: 'alert',
        resourceId: alert.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          alertTitle: alert.title,
          alertSeverity: alert.severity,
          alertStatus: alert.status
        }
      });

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('alert.deleted', {
          id: alert.id
        });
      }

      res.json({
        success: true,
        message: 'Alert deleted successfully'
      });

    } catch (error) {
      logger.error('Delete alert error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;