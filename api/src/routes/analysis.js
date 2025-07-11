const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { AnalysisJob, Extraction } = require('../services/models');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { createAnalysisJob } = require('../services/jobService');
const { logger } = require('../utils/logger');

const router = express.Router();

// Internal endpoint for service-triggered analysis (BEFORE auth middleware)
router.post('/internal', 
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
      // Check service authentication token
      const serviceToken = req.headers['x-service-token'];
      if (!serviceToken || serviceToken !== process.env.SERVICE_AUTH_TOKEN) {
        return res.status(403).json({
          error: 'Invalid service token'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { extractionId, type, priority = 'medium', parameters = {} } = req.body;

      // Get extraction to determine organization
      const { getRow } = require('../services/database');
      const extraction = await getRow(
        'SELECT * FROM maes.extractions WHERE id = $1',
        [extractionId]
      );

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

      // Create analysis job record
      const analysisJob = await AnalysisJob.create({
        extractionId,
        organizationId: extraction.organization_id,
        type,
        priority,
        parameters: {
          ...parameters,
          autoTriggered: true
        },
        status: 'pending'
      });

      // Queue analysis job
      await createAnalysisJob(analysisJob);

      logger.info(`Internal analysis job created: ${analysisJob.id} for extraction ${extractionId}`);

      res.status(201).json({
        success: true,
        analysisJob
      });

    } catch (error) {
      logger.error('Create internal analysis job error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Direct database record creation endpoint (for fallback scenarios)
router.post('/internal/direct', 
  [
    body('id').isUUID().withMessage('Valid job ID is required'),
    body('extractionId').isUUID().withMessage('Valid extraction ID is required'),
    body('organizationId').isUUID().withMessage('Valid organization ID is required'),
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
      // Check service authentication token
      const serviceToken = req.headers['x-service-token'];
      if (!serviceToken || serviceToken !== process.env.SERVICE_AUTH_TOKEN) {
        return res.status(403).json({
          error: 'Invalid service token'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { id, extractionId, organizationId, type, priority = 'medium', parameters = {} } = req.body;

      // Create analysis job record with specific ID
      const { execute } = require('../services/database');
      await execute(
        `INSERT INTO maes.analysis_jobs (id, extraction_id, organization_id, type, priority, parameters, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [id, extractionId, organizationId, type, priority, JSON.stringify({...parameters, autoTriggered: true}), 'pending']
      );

      logger.info(`Direct analysis job record created: ${id} for extraction ${extractionId}`);

      res.status(201).json({
        success: true,
        analysisJob: {
          id,
          extractionId,
          organizationId,
          type,
          priority,
          parameters: {...parameters, autoTriggered: true},
          status: 'pending'
        }
      });

    } catch (error) {
      logger.error('Create direct analysis job record error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Apply authentication and rate limiting to other routes
router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * @swagger
 * /api/analysis:
 *   get:
 *     summary: Get analysis jobs with pagination and filtering
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by analysis type
 *     responses:
 *       200:
 *         description: List of analysis jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 analysisJobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AnalysisJob'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

      // Get analysis jobs for the current organization
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.type) filters.type = req.query.type;
      
      // Get analysis jobs from database
      const { getRows, count } = require('../services/database');
      
      // Debug logging
      logger.info(`Analysis jobs request for organization: ${req.organizationId}`);
      
      let whereClause = 'WHERE aj.organization_id = $1';
      const values = [req.organizationId];
      let paramCount = 2;
      
      if (filters.status) {
        whereClause += ` AND aj.status = $${paramCount}`;
        values.push(filters.status);
        paramCount++;
      }
      
      if (filters.type) {
        whereClause += ` AND aj.type = $${paramCount}`;
        values.push(filters.type);
        paramCount++;
      }
      
      const analysisJobsQuery = `
        SELECT 
          aj.*,
          e.type as extraction_type,
          e.start_date as extraction_start_date,
          e.end_date as extraction_end_date,
          e.items_extracted,
          e.created_at as extraction_created_at
        FROM maes.analysis_jobs aj
        LEFT JOIN maes.extractions e ON aj.extraction_id = e.id
        ${whereClause}
        ORDER BY aj.created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      
      const countQuery = `
        SELECT COUNT(*) as count
        FROM maes.analysis_jobs aj
        LEFT JOIN maes.extractions e ON aj.extraction_id = e.id
        ${whereClause}
      `;
      
      values.push(limit, offset);
      
      // Debug logging
      logger.info('Analysis jobs query:', { query: analysisJobsQuery, values });
      
      const [analysisJobs, totalCountResult] = await Promise.all([
        getRows(analysisJobsQuery, values),
        count(countQuery, values.slice(0, -2))
      ]);
      
      logger.info(`Analysis jobs found: ${analysisJobs.length}`);
      const totalCount = totalCountResult || 0;

      res.json({
        success: true,
        analysisJobs,
        pagination: {
          total: totalCount,
          page,
          pages: Math.ceil(totalCount / limit),
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
    const analysisJob = await AnalysisJob.findById(req.params.id);

    if (!analysisJob) {
      return res.status(404).json({
        error: 'Analysis job not found'
      });
    }

    // Get the associated extraction to verify organization access
    const extraction = await Extraction.findById(analysisJob.extraction_id, req.organizationId);
    if (!extraction) {
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
      const extraction = await Extraction.findById(extractionId, req.organizationId);

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
    const analysisJob = await AnalysisJob.findById(req.params.id);

    if (!analysisJob) {
      return res.status(404).json({
        error: 'Analysis job not found'
      });
    }

    // Get the associated extraction to verify organization access
    const extraction = await Extraction.findById(analysisJob.extraction_id, req.organizationId);
    if (!extraction) {
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
      outputFiles: analysisJob.output_files
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
      const analysisJob = await AnalysisJob.findById(req.params.id);

      if (!analysisJob) {
        return res.status(404).json({
          error: 'Analysis job not found'
        });
      }

      // Get the associated extraction to verify organization access
      const extraction = await Extraction.findById(analysisJob.extraction_id, req.organizationId);
      if (!extraction) {
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
      const updatedJob = await AnalysisJob.update(analysisJob.id, { status: 'cancelled' });

      // TODO: Cancel the actual job in the queue

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('analysis.cancelled', {
          id: analysisJob.id,
          status: 'cancelled'
        });
      }

      res.json({
        success: true,
        analysisJob: updatedJob
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