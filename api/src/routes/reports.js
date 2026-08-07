const express = require('express');
const fs = require('fs');
const { body, query, validationResult } = require('express-validator');
const { Report } = require('../services/models');
const { generateReport } = require('../services/reportGenerator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

// Get reports with pagination and filtering
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('type').optional().isIn(['executive_summary', 'incident_report', 'compliance_report', 'threat_analysis', 'user_activity', 'system_health', 'custom']).withMessage('Invalid report type'),
    query('status').optional().isIn(['pending', 'completed', 'failed']).withMessage('Invalid status')
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

      const { rows, total } = await Report.listByOrganization(req.organizationId, {
        type: req.query.type,
        status: req.query.status,
        limit,
        offset
      });

      res.json({
        success: true,
        reports: rows,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      });

    } catch (error) {
      logger.error('Get reports error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get single report
router.get('/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id, req.organizationId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found'
      });
    }

    res.json({
      success: true,
      report
    });

  } catch (error) {
    logger.error('Get report error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create new report
router.post('/',
  requirePermission('canViewReports'),
  [
    body('name').isLength({ min: 3, max: 255 }).withMessage('Name must be between 3 and 255 characters'),
    body('type').isIn(['executive_summary', 'incident_report', 'compliance_report', 'threat_analysis', 'user_activity', 'system_health', 'custom']).withMessage('Invalid report type'),
    body('format').optional().isIn(['pdf', 'docx', 'xlsx', 'html', 'json']).withMessage('Invalid format'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
    body('schedule').optional().isObject().withMessage('Schedule must be an object')
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

      const { name, type, format = 'html', parameters = {}, schedule = {} } = req.body;

      // Create the report record as pending.
      const report = await Report.create({
        organizationId: req.organizationId,
        createdBy: req.user.id,
        name,
        type,
        format,
        parameters,
        schedule,
        status: 'pending'
      });

      // Generate the artifact. PDF/DOCX/XLSX are rendered as HTML for now; the
      // download endpoint streams whatever file was produced.
      try {
        await generateReport(report);
      } catch (genError) {
        logger.error('Report generation failed:', genError);
        await Report.update(report.id, {
          status: 'failed',
          error: genError.message
        });
      }

      const updated = await Report.findById(report.id, req.organizationId);

      res.status(201).json({
        success: true,
        report: updated
      });

    } catch (error) {
      logger.error('Create report error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Download report
router.get('/:id/download', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id, req.organizationId);

    if (!report) {
      return res.status(404).json({
        error: 'Report not found'
      });
    }

    if (report.status !== 'completed' || !report.filePath) {
      return res.status(400).json({
        error: 'Report is not ready for download'
      });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({
        error: 'Report file is missing'
      });
    }

    const fileName = report.fileName || 'report';
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', fileName.endsWith('.json') ? 'application/json' : 'text/html');
    res.sendFile(report.filePath);

  } catch (error) {
    logger.error('Download report error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete report
router.delete('/:id',
  requirePermission('canViewReports'),
  async (req, res) => {
    try {
      const report = await Report.findById(req.params.id, req.organizationId);

      if (!report) {
        return res.status(404).json({
          error: 'Report not found'
        });
      }

      // Only allow deletion of own reports or if user is admin/super_admin
      if (report.created_by !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({
          error: 'Not authorized to delete this report'
        });
      }

      // Clean up the generated file if it exists.
      if (report.filePath && fs.existsSync(report.filePath)) {
        try {
          fs.unlinkSync(report.filePath);
        } catch (unlinkError) {
          logger.warn('Failed to remove report file:', unlinkError.message);
        }
      }

      await Report.remove(report.id, req.organizationId);

      res.json({
        success: true,
        message: 'Report deleted successfully'
      });

    } catch (error) {
      logger.error('Delete report error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;
