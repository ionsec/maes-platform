const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { AnalysisJob, Extraction } = require('../services/models');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { createAnalysisJob } = require('../services/jobService');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

// Get analysis jobs with pagination and filtering
router.get('/', 
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled']).withMessage('Invalid status'),
    query('type').optional().isString().withMessage('Type must be a string')
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
      if (req.query.status) where.status = req.query.status;
      if (req.query.type) where.type = req.query.type;

      const { count, rows } = await AnalysisJob.findAndCountAll({
        where,
        include: [{
          model: Extraction,
          where: { organizationId: req.organizationId },
          attributes: ['id', 'type', 'start_date', 'end_date']
        }],
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        analysisJobs: rows,
        pagination: {
          total: count,
          page,
          pages: Math.ceil(count / limit),
          limit
        }
      });

    } catch (error) {
      logger.error('Get analysis jobs error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get single analysis job
router.get('/:id', async (req, res) => {
  try {
    const analysisJob = await AnalysisJob.findOne({
      where: { id: req.params.id },
      include: [{
        model: Extraction,
        where: { organizationId: req.organizationId },
        attributes: ['id', 'type', 'start_date', 'end_date', 'organization_id']
      }]
    });

    if (!analysisJob) {
      return res.status(404).json({
        error: 'Analysis job not found'
      });
    }

    res.json({
      success: true,
      analysisJob
    });

  } catch (error) {
    logger.error('Get analysis job error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create new analysis job
router.post('/', 
  requirePermission('canRunAnalysis'),
  [
    body('extractionId').isUUID().withMessage('Valid extraction ID is required'),
    body('type').isIn([
      'ual_analysis',
      'signin_analysis',
      'audit_analysis',
      'mfa_analysis',
      'oauth_analysis',
      'risky_detection_analysis',
      'risky_user_analysis',
      'message_trace_analysis',
      'device_analysis',
      'comprehensive_analysis'
    ]).withMessage('Invalid analysis type'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object')
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

      const { extractionId, type, priority = 'medium', parameters = {} } = req.body;

      // Verify extraction exists in database and belongs to organization
      const extraction = await Extraction.findOne({
        where: {
          id: extractionId,
          organizationId: req.organizationId
        }
      });

      if (!extraction) {
        return res.status(404).json({
          error: 'Extraction not found'
        });
      }

      if (extraction.status !== 'completed') {
        return res.status(400).json({
          error: 'Cannot analyze incomplete extraction'
        });
      }

      // Check if this is an uploaded extraction
      const isUploadedExtraction = extraction.parameters?.isUpload === true;

      // Create analysis job record
      const analysisJob = await AnalysisJob.create({
        extractionId,
        organizationId: req.organizationId,
        type,
        priority,
        parameters,
        status: 'pending'
      });

      // Queue analysis job
      await createAnalysisJob(analysisJob);

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('analysis.started', {
          id: analysisJob.id,
          extractionId,
          type: analysisJob.type,
          status: analysisJob.status
        });
      }

      res.status(201).json({
        success: true,
        analysisJob
      });

    } catch (error) {
      logger.error('Create analysis job error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get analysis results
router.get('/:id/results', async (req, res) => {
  try {
    const analysisJob = await AnalysisJob.findOne({
      where: { id: req.params.id },
      include: [{
        model: Extraction,
        where: { organizationId: req.organizationId },
        attributes: ['id', 'organizationId']
      }]
    });

    if (!analysisJob) {
      return res.status(404).json({
        error: 'Analysis job not found'
      });
    }

    if (analysisJob.status !== 'completed') {
      return res.status(400).json({
        error: 'Analysis is not yet completed'
      });
    }

    res.json({
      success: true,
      results: analysisJob.results,
      alerts: analysisJob.alerts,
      outputFiles: analysisJob.outputFiles
    });

  } catch (error) {
    logger.error('Get analysis results error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Cancel analysis job
router.post('/:id/cancel', 
  requirePermission('canRunAnalysis'),
  async (req, res) => {
    try {
      const analysisJob = await AnalysisJob.findOne({
        where: { id: req.params.id },
        include: [{
          model: Extraction,
          where: { organizationId: req.organizationId },
          attributes: ['id', 'organizationId']
        }]
      });

      if (!analysisJob) {
        return res.status(404).json({
          error: 'Analysis job not found'
        });
      }

      if (!['pending', 'running'].includes(analysisJob.status)) {
        return res.status(400).json({
          error: 'Cannot cancel analysis job in current status'
        });
      }

      // Update status
      analysisJob.status = 'cancelled';
      await analysisJob.save();

      // TODO: Cancel the actual job in the queue

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('analysis.cancelled', {
          id: analysisJob.id,
          status: analysisJob.status
        });
      }

      res.json({
        success: true,
        analysisJob
      });

    } catch (error) {
      logger.error('Cancel analysis job error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;