const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Extraction } = require('../services/models');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { createExtractionJob, extractionQueue } = require('../services/jobService');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

// Get extractions with pagination and filtering
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

      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.type) filters.type = req.query.type;

      const result = await Extraction.findAll(req.organizationId, filters, page, limit);

      // Transform database column names to camelCase and mark uploaded extractions
      const extractionsWithUploadFlag = result.extractions.map(extraction => ({
        ...extraction,
        outputFiles: extraction.output_files || [],  // Transform snake_case to camelCase
        isUpload: extraction.parameters?.isUpload === true
      }));

      res.json({
        success: true,
        extractions: extractionsWithUploadFlag,
        pagination: result.pagination
      });

    } catch (error) {
      logger.error('Get extractions error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get single extraction
router.get('/:id', async (req, res) => {
  try {
    const extraction = await Extraction.findById(req.params.id, req.organizationId);

    if (!extraction) {
      return res.status(404).json({
        error: 'Extraction not found'
      });
    }

    const extractionData = { 
      ...extraction,
      outputFiles: extraction.output_files || [],  // Transform snake_case to camelCase
      isUpload: extraction.parameters?.isUpload === true
    };

    res.json({
      success: true,
      extraction: extractionData
    });

  } catch (error) {
    logger.error('Get extraction error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Create new extraction
router.post('/', 
  requirePermission('canManageExtractions'),
  [
    body('type').isIn([
      'unified_audit_log',
      'azure_signin_logs',
      'azure_audit_logs',
      'mailbox_audit',
      'message_trace',
      'emails',
      'oauth_permissions',
      'mfa_status',
      'risky_users',
      'risky_detections',
      'devices',
      'ual_graph',
      'licenses',
      'full_extraction'
    ]).withMessage('Invalid extraction type'),
    body('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
    body('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
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

      const { type, startDate, endDate, priority = 'medium', parameters = {} } = req.body;

      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start >= end) {
        return res.status(400).json({
          error: 'Start date must be before end date'
        });
      }

      // Create extraction record
      const extraction = await Extraction.create({
        organizationId: req.organizationId,
        type,
        startDate: start,
        endDate: end,
        priority,
        parameters,
        triggeredBy: req.user.id,
        status: 'pending'
      });

      // Queue extraction job
      await createExtractionJob(extraction);

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('extraction.started', {
          id: extraction.id,
          type: extraction.type,
          status: extraction.status
        });
      }

      res.status(201).json({
        success: true,
        extraction
      });

    } catch (error) {
      logger.error('Create extraction error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Cancel extraction
router.post('/:id/cancel', 
  requirePermission('canManageExtractions'),
  async (req, res) => {
    try {
      const extraction = await Extraction.findById(req.params.id, req.organizationId);

      if (!extraction) {
        return res.status(404).json({
          error: 'Extraction not found'
        });
      }

      if (!['pending', 'running'].includes(extraction.status)) {
        return res.status(400).json({
          error: 'Cannot cancel extraction in current status'
        });
      }

      // Update status
      await Extraction.update(extraction.id, { status: 'cancelled' });

      // TODO: Cancel the actual job in the queue

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.to(`org-${req.organizationId}`).emit('extraction.cancelled', {
          id: extraction.id,
          status: extraction.status
        });
      }

      res.json({
        success: true,
        extraction
      });

    } catch (error) {
      logger.error('Cancel extraction error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get real-time extraction progress
router.get('/:id/progress', async (req, res) => {
  try {
    const extraction = await Extraction.findById(req.params.id, req.organizationId);

    if (!extraction) {
      return res.status(404).json({
        error: 'Extraction not found'
      });
    }

    let progressData = {
      extractionId: extraction.id,
      status: extraction.status,
      progress: extraction.progress || 0,
      currentMessage: '',
      lastUpdated: extraction.updated_at,
      ualStatus: null
    };

    // If extraction is running, try to get real-time progress from job queue
    if (extraction.status === 'running') {
      try {
        const activeJobs = await extractionQueue.getActive();
        const extractionJob = activeJobs.find(job => job.data.extractionId === extraction.id);
        
        if (extractionJob) {
          progressData.progress = extractionJob.progress;
          
          // Get progress update from job data if available
          if (extractionJob.data.progressUpdate) {
            const update = extractionJob.data.progressUpdate;
            progressData.progress = update.progress;
            progressData.currentMessage = update.lastMessage || '';
            progressData.lastUpdated = update.updatedAt;
          }
          
          // Get UAL status if available
          if (extractionJob.data.ualStatus) {
            progressData.ualStatus = extractionJob.data.ualStatus;
          }
        }
      } catch (jobError) {
        logger.warn(`Could not get job progress for extraction ${extraction.id}:`, jobError);
      }
    }

    res.json({
      success: true,
      progress: progressData
    });

  } catch (error) {
    logger.error('Get extraction progress error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Update extraction status (internal service endpoint)
router.patch('/:id/status', async (req, res) => {
  try {
    // This endpoint is only for internal service communication
    if (!req.isServiceRequest) {
      return res.status(403).json({
        error: 'This endpoint is for internal service communication only'
      });
    }

    const { status, outputFiles, statistics, completedAt, errorMessage, progress } = req.body;

    // Validate status
    if (!['pending', 'running', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status'
      });
    }

    // Update extraction record
    const updateData = { status };
    if (outputFiles) updateData.outputFiles = outputFiles;
    if (statistics) {
      updateData.statistics = statistics;
      // Update items_extracted from statistics.totalEvents
      if (statistics.totalEvents !== undefined) {
        updateData.itemsExtracted = statistics.totalEvents;
      }
    }
    if (completedAt) updateData.completedAt = new Date(completedAt);
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (progress !== undefined) updateData.progress = progress;

    // First verify the extraction exists and belongs to the organization
    const existingExtraction = await Extraction.findById(req.params.id, req.organizationId);
    if (!existingExtraction) {
      return res.status(404).json({
        error: 'Extraction not found or access denied'
      });
    }

    const extraction = await Extraction.update(req.params.id, updateData);

    if (!extraction) {
      return res.status(404).json({
        error: 'Failed to update extraction'
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`org-${extraction.organizationId}`).emit('extraction.updated', {
        id: extraction.id,
        status: extraction.status,
        outputFiles: extraction.outputFiles,
        statistics: extraction.statistics
      });
    }

    logger.info(`Extraction ${req.params.id} status updated to ${status}`);

    res.json({
      success: true,
      extraction
    });

  } catch (error) {
    logger.error('Update extraction status error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get extraction logs
router.get('/:id/logs', async (req, res) => {
  try {
    const extraction = await Extraction.findById(req.params.id, req.organizationId);

    if (!extraction) {
      return res.status(404).json({
        error: 'Extraction not found'
      });
    }

    // Check if this is an uploaded extraction
    if (extraction.parameters?.isUpload) {
      const uploadInfo = extraction.parameters.uploadedFile;
      const logs = [
        { 
          timestamp: extraction.createdAt, 
          level: 'info', 
          message: `File uploaded: ${uploadInfo.originalName}` 
        },
        { 
          timestamp: extraction.createdAt, 
          level: 'info', 
          message: `File size: ${(uploadInfo.size / 1024 / 1024).toFixed(2)} MB` 
        },
        { 
          timestamp: extraction.createdAt, 
          level: 'info', 
          message: `Data type: ${extraction.type}` 
        },
        { 
          timestamp: extraction.createdAt, 
          level: 'success', 
          message: `Items loaded: ${extraction.itemsExtracted}` 
        }
      ];
      
      return res.json({
        success: true,
        logs
      });
    }

    // Fetch logs from Redis for regular extractions
    const redisClient = require('redis').createClient({
      url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`
    });

    try {
      await redisClient.connect();
      
      // Get logs from Redis
      const logKey = `extraction:logs:${extraction.id}`;
      const rawLogs = await redisClient.lRange(logKey, 0, -1);
      
      // Parse logs
      const logs = rawLogs.map(log => {
        try {
          return JSON.parse(log);
        } catch (e) {
          return { timestamp: new Date(), level: 'info', message: log };
        }
      });

      // If no logs found in Redis, return default logs
      if (logs.length === 0) {
        logs.push({ timestamp: extraction.createdAt, level: 'info', message: 'Extraction job created' });
        
        if (extraction.status === 'running') {
          logs.push({ timestamp: new Date(), level: 'info', message: 'Extraction is currently running...' });
        } else if (extraction.status === 'completed') {
          logs.push({ timestamp: extraction.completedAt || extraction.updatedAt, level: 'success', message: 'Extraction completed' });
        } else if (extraction.status === 'failed') {
          logs.push({ timestamp: extraction.updatedAt, level: 'error', message: extraction.errorMessage || 'Extraction failed' });
        }
      }

      await redisClient.disconnect();

      res.json({
        success: true,
        logs
      });

    } catch (redisError) {
      logger.error('Redis error while fetching logs:', redisError);
      
      // Fallback to basic logs if Redis fails
      const fallbackLogs = [
        { timestamp: extraction.createdAt, level: 'info', message: 'Extraction job created' }
      ];
      
      if (extraction.status === 'failed' && extraction.errorMessage) {
        fallbackLogs.push({ timestamp: extraction.updatedAt, level: 'error', message: extraction.errorMessage });
      }

      res.json({
        success: true,
        logs: fallbackLogs
      });
    }

  } catch (error) {
    logger.error('Get extraction logs error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Download extraction results as ZIP
router.get('/:id/download', async (req, res) => {
  try {
    const extraction = await Extraction.findById(req.params.id, req.organizationId);

    if (!extraction) {
      return res.status(404).json({
        error: 'Extraction not found'
      });
    }

    if (extraction.status !== 'completed') {
      return res.status(400).json({
        error: 'Extraction not completed yet'
      });
    }

    if (!extraction.output_files || extraction.output_files.length === 0) {
      return res.status(404).json({
        error: 'No output files found for this extraction'
      });
    }

    const archiver = require('archiver');
    const fs = require('fs');
    const path = require('path');

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set appropriate headers
    const extractionType = extraction.type || 'extraction';
    const timestamp = new Date().toISOString().split('T')[0];
    const zipFilename = `${extractionType}_${extraction.id}_${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    archive.pipe(res);

    // Add each output file to the archive
    let filesAdded = 0;
    for (const file of extraction.output_files) {
      try {
        const filePath = file.path;
        
        // Check if file exists
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            archive.file(filePath, { name: file.filename });
            filesAdded++;
            logger.info(`Added file to archive: ${file.filename}`);
          }
        } else {
          logger.warn(`File not found: ${filePath}`);
        }
      } catch (fileError) {
        logger.error(`Error adding file to archive: ${file.filename}`, fileError);
      }
    }

    if (filesAdded === 0) {
      archive.destroy();
      return res.status(404).json({
        error: 'No accessible output files found'
      });
    }

    // Add extraction metadata as JSON file
    const metadata = {
      extractionId: extraction.id,
      type: extraction.type,
      status: extraction.status,
      startDate: extraction.startDate,
      endDate: extraction.endDate,
      createdAt: extraction.createdAt,
      completedAt: extraction.completedAt,
      duration: extraction.duration,
      statistics: extraction.statistics,
      itemsExtracted: extraction.itemsExtracted,
      outputFiles: extraction.output_files.map(f => ({
        filename: f.filename,
        size: f.size,
        createdAt: f.createdAt
      })),
      parameters: extraction.parameters
    };

    archive.append(JSON.stringify(metadata, null, 2), { name: 'extraction_metadata.json' });

    // Finalize the archive
    archive.finalize();

    logger.info(`ZIP download initiated for extraction ${extraction.id} with ${filesAdded} files`);

  } catch (error) {
    logger.error('Download extraction error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;