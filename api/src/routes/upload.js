const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const { createAnalysisJob } = require('../services/jobService');
const { AnalysisJob } = require('../services/models');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const router = express.Router();

// Map data types to analysis types
const DATA_TYPE_TO_ANALYSIS_TYPE = {
  'unified_audit_log': 'ual_analysis',
  'azure_signin_logs': 'signin_analysis',
  'azure_audit_logs': 'audit_analysis',
  'mfa_status': 'mfa_analysis',
  'oauth_permissions': 'oauth_analysis',
  'risky_users': 'risky_user_analysis',
  'risky_detections': 'risky_detection_analysis',
  'mailbox_audit': 'audit_analysis',
  'message_trace': 'message_trace_analysis',
  'devices': 'device_analysis'
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads', req.organizationId);
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    
    // Sanitize the original filename
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe characters
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 100); // Limit length
    
    // Ensure file has a safe extension
    const extension = path.extname(sanitizedName).toLowerCase();
    const baseName = path.basename(sanitizedName, extension);
    
    // Generate secure filename
    const secureFilename = `${Date.now()}-${uniqueSuffix}-${baseName}${extension}`;
    
    cb(null, secureFilename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // Reduced to 50MB limit for security
    files: 5, // Maximum 5 files per request
    fieldSize: 1024 * 1024, // 1MB field size limit
    fieldNameSize: 100, // Field name size limit
    headerPairs: 2000 // Limit header pairs
  },
  fileFilter: (req, file, cb) => {
    // Strict validation - only allow specific file types
    const allowedMimeTypes = [
      'application/json', 
      'text/csv', 
      'text/plain',
      'application/csv'
    ];
    
    const allowedExtensions = /\.(json|csv|txt|log)$/i;
    
    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error(`Invalid MIME type: ${file.mimetype}. Only JSON, CSV, TXT, and LOG files are allowed.`));
    }
    
    // Check file extension
    if (!allowedExtensions.test(file.originalname)) {
      return cb(new Error(`Invalid file extension. Only .json, .csv, .txt, and .log files are allowed.`));
    }
    
    // Check for suspicious file names
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /[<>:"\/\\|?*\x00-\x1f]/,  // Invalid characters
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i,  // Reserved Windows names
      /^\./,   // Hidden files
      /\s{2,}/, // Multiple spaces
      /.{255,}/ // Very long names
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.originalname)) {
        return cb(new Error(`Suspicious file name detected: ${file.originalname}`));
      }
    }
    
    // Additional security: Check file size again at filter level
    if (file.size && file.size > 50 * 1024 * 1024) {
      return cb(new Error('File too large. Maximum size is 50MB.'));
    }
    
    cb(null, true);
  }
});

// Get uploaded data for analysis (internal endpoint for analyzer service)
// This endpoint must come BEFORE the authentication middleware
router.get('/data/:extractionId',
  // This endpoint allows service token authentication
  async (req, res) => {
    // Check for service token
    const serviceToken = req.headers['x-service-token'];
    const SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'service_internal_token_change_in_production';
    
    if (serviceToken !== SERVICE_AUTH_TOKEN) {
      return res.status(401).json({
        error: 'Service authentication required'
      });
    }
    
    // Set organization context from service request header
    const organizationId = req.headers['x-organization-id'];
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID required for service requests'
      });
    }
    req.organizationId = organizationId;
    try {
      const { extractionId } = req.params;
      
      // First check memory cache with organization validation
      const uploadedExtractions = req.app.locals.uploadedExtractions || {};
      let extraction = uploadedExtractions[extractionId];
      
      // Validate organization access for memory cached extractions
      if (extraction && (!req.organizationId || extraction.organizationId !== req.organizationId)) {
        return res.status(404).json({
          error: 'Uploaded extraction not found'
        });
      }
      
      if (!extraction) {
        // Check database for the extraction with organization validation
        const { Extraction } = require('../services/models');
        const dbExtraction = await Extraction.findById(extractionId, req.organizationId);
        
        if (!dbExtraction || !dbExtraction.parameters?.isUpload) {
          return res.status(404).json({
            error: 'Uploaded extraction not found'
          });
        }
        
        extraction = dbExtraction;
      }
      
      // Return the uploaded data
      res.json({
        success: true,
        data: extraction.auditData || extraction.parameters?.auditData || [],
        extractionInfo: {
          id: extraction.id,
          type: extraction.type,
          itemsExtracted: extraction.itemsExtracted || 0,
          createdAt: extraction.createdAt
        }
      });
      
    } catch (error) {
      logger.error('Get uploaded data error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Apply authentication and rate limiting to all other routes
router.use(authenticateToken);
router.use(apiRateLimiter);

// Upload pre-extracted logs
router.post('/logs',
  requirePermission('canRunAnalysis'),
  upload.single('file'),
  [
    body('dataType').isIn([
      'unified_audit_log',
      'azure_signin_logs',
      'azure_audit_logs',
      'mfa_status',
      'oauth_permissions',
      'risky_users',
      'risky_detections',
      'mailbox_audit',
      'message_trace',
      'devices'
    ]).withMessage('Invalid data type'),
    body('metadata').optional().isJSON().withMessage('Metadata must be valid JSON')
  ],
  async (req, res) => {
    try {
      logger.info('Upload request received', {
        file: req.file?.originalname,
        dataType: req.body.dataType,
        organizationId: req.organizationId
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        logger.error('Upload validation failed:', errors.array());
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      if (!req.file) {
        logger.error('No file uploaded in request');
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }

      const { dataType, metadata } = req.body;
      const parsedMetadata = metadata ? JSON.parse(metadata) : {};
      
      logger.info('Processing uploaded file', {
        fileName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        dataType: dataType
      });

      // Read and validate file content
      const fileContent = await fs.readFile(req.file.path, 'utf8');
      let parsedData;
      
      try {
        if (req.file.mimetype === 'application/json' || req.file.originalname.endsWith('.json')) {
          parsedData = JSON.parse(fileContent);
        } else if (req.file.originalname.endsWith('.csv') || req.file.mimetype === 'text/csv' || req.file.mimetype === 'application/csv') {
          // Parse CSV file
          const csvParser = require('csv-parser');
          const stream = require('stream');
          
          parsedData = [];
          const readable = stream.Readable.from(fileContent);
          
          await new Promise((resolve, reject) => {
            readable
              .pipe(csvParser())
              .on('data', (row) => {
                // Clean up field names (remove BOM and trim)
                const cleanedRow = {};
                for (const [key, value] of Object.entries(row)) {
                  const cleanKey = key.replace(/^\uFEFF/, '').trim();
                  cleanedRow[cleanKey] = value;
                }
                parsedData.push(cleanedRow);
              })
              .on('end', resolve)
              .on('error', reject);
          });
          
          logger.info(`Parsed CSV file: ${parsedData.length} rows`);
        } else {
          // For TXT/LOG files, try to parse as JSON first, otherwise keep as text
          try {
            parsedData = JSON.parse(fileContent);
          } catch {
            // If not JSON, split by lines for log files
            if (req.file.originalname.endsWith('.log') || req.file.originalname.endsWith('.txt')) {
              parsedData = fileContent.split('\n')
                .filter(line => line.trim())
                .map(line => {
                  try {
                    // Try to parse each line as JSON
                    return JSON.parse(line);
                  } catch {
                    // If not JSON, keep as text line
                    return { raw: line };
                  }
                });
            } else {
              parsedData = { raw: fileContent, format: 'text' };
            }
          }
        }
      } catch (parseError) {
        logger.error('Parse error:', parseError);
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          error: 'Invalid file content',
          details: parseError.message
        });
      }

      // Create a real extraction record in the database for the uploaded data
      const { Extraction } = require('../services/models');
      
      // Calculate items extracted properly
      let itemsExtracted = 1;
      if (Array.isArray(parsedData)) {
        itemsExtracted = parsedData.length;
      } else if (parsedData && typeof parsedData === 'object' && !parsedData.raw) {
        // If it's an object but not a raw text format, count its properties
        itemsExtracted = Object.keys(parsedData).length;
      }
      
      logger.info('Creating extraction record', {
        dataType,
        itemsExtracted,
        dataStructure: Array.isArray(parsedData) ? 'array' : typeof parsedData
      });
      
      const extraction = await Extraction.create({
        type: dataType,
        status: 'completed',
        organizationId: req.organizationId,
        startDate: parsedMetadata.startDate || new Date(),
        endDate: parsedMetadata.endDate || new Date(),
        itemsExtracted: itemsExtracted,
        progress: 100,
        parameters: {
          isUpload: true,
          uploadedFile: {
            path: req.file.path,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
          }
        },
        metadata: {
          ...parsedMetadata,
          uploadInfo: {
            uploadedAt: new Date().toISOString(),
            originalFileName: req.file.originalname
          }
        }
      });

      // Store the uploaded data in memory for analysis
      req.app.locals.uploadedExtractions = req.app.locals.uploadedExtractions || {};
      req.app.locals.uploadedExtractions[extraction.id] = {
        id: extraction.id,
        extractionId: extraction.id,
        organizationId: req.organizationId, // Add organization context
        type: dataType,
        status: 'completed',
        startDate: extraction.startDate,
        endDate: extraction.endDate,
        itemsExtracted: extraction.itemsExtracted,
        auditData: parsedData, // Store as auditData for consistency with analyzer
        data: parsedData, // Keep for backward compatibility
        parameters: {
          isUpload: true,
          auditData: parsedData // Also store in parameters for analyzer access
        },
        uploadedFile: {
          path: req.file.path,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype
        },
        createdAt: new Date()
      };

      // Clean up old uploads after 24 hours
      setTimeout(async () => {
        try {
          await fs.unlink(req.file.path);
          delete req.app.locals.uploadedExtractions[extraction.id];
          // Also remove from database
          await extraction.destroy();
        } catch (error) {
          logger.error('Failed to clean up uploaded file:', error);
        }
      }, 24 * 60 * 60 * 1000);

      logger.info('Upload successful', {
        extractionId: extraction.id,
        dataType: dataType,
        itemsExtracted: extraction.itemsExtracted,
        fileName: req.file.originalname
      });

      // Automatically create and queue analysis job for uploaded data
      try {
        const analysisType = DATA_TYPE_TO_ANALYSIS_TYPE[dataType] || 'comprehensive_analysis';
        
        logger.info('Creating automatic analysis job', {
          extractionId: extraction.id,
          analysisType: analysisType,
          organizationId: req.organizationId
        });

        // Create analysis job record
        const analysisJob = await AnalysisJob.create({
          extractionId: extraction.id,
          organizationId: req.organizationId,
          type: analysisType,
          priority: 'medium',
          parameters: {
            autoTriggered: true,
            fromUpload: true,
            uploadFileName: req.file.originalname,
            enableThreatIntel: true,
            enablePatternDetection: true,
            enableAnomalyDetection: false
          },
          status: 'pending'
        });

        // Queue the analysis job
        await createAnalysisJob(analysisJob);

        logger.info('Analysis job created and queued', {
          analysisJobId: analysisJob.id,
          extractionId: extraction.id
        });

        // Return response with both extraction and analysis job info
        res.status(201).json({
          success: true,
          extraction: {
            id: extraction.id,
            type: extraction.type,
            status: extraction.status,
            startDate: extraction.startDate,
            endDate: extraction.endDate,
            itemsExtracted: extraction.itemsExtracted,
            isUpload: true,
            parameters: extraction.parameters
          },
          analysisJob: {
            id: analysisJob.id,
            type: analysisJob.type,
            status: analysisJob.status,
            message: 'Analysis job automatically started'
          }
        });

      } catch (analysisError) {
        // If analysis job creation fails, still return success for upload
        // but log the error and inform the user
        logger.error('Failed to create automatic analysis job:', analysisError);
        
        res.status(201).json({
          success: true,
          extraction: {
            id: extraction.id,
            type: extraction.type,
            status: extraction.status,
            startDate: extraction.startDate,
            endDate: extraction.endDate,
            itemsExtracted: extraction.itemsExtracted,
            isUpload: true,
            parameters: extraction.parameters
          },
          warning: 'Upload successful but automatic analysis could not be started. Please manually start analysis.'
        });
      }

    } catch (error) {
      logger.error('Upload logs error:', error);
      
      // Clean up uploaded file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Get uploaded extractions
router.get('/extractions',
  async (req, res) => {
    try {
      const uploadedExtractions = req.app.locals.uploadedExtractions || {};
      const orgExtractions = Object.values(uploadedExtractions)
        .filter(e => e.organizationId === req.organizationId)
        .map(e => ({
          id: e.id,
          type: e.type,
          status: e.status,
          startDate: e.startDate,
          endDate: e.endDate,
          itemsExtracted: e.itemsExtracted,
          isUpload: true,
          createdAt: e.createdAt
        }));

      res.json({
        success: true,
        extractions: orgExtractions
      });

    } catch (error) {
      logger.error('Get uploaded extractions error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);


module.exports = router;