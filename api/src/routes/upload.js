const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const router = express.Router();

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
    const uniqueSuffix = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept JSON and CSV files
    const allowedTypes = ['application/json', 'text/csv', 'text/plain'];
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(json|csv|txt|log)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, CSV, TXT, and LOG files are allowed.'));
    }
  }
});

// Apply authentication and rate limiting
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }

      const { dataType, metadata } = req.body;
      const parsedMetadata = metadata ? JSON.parse(metadata) : {};

      // Read and validate file content
      const fileContent = await fs.readFile(req.file.path, 'utf8');
      let parsedData;
      
      try {
        if (req.file.mimetype === 'application/json' || req.file.originalname.endsWith('.json')) {
          parsedData = JSON.parse(fileContent);
        } else {
          // For CSV/TXT files, we'll need specific parsing based on dataType
          parsedData = { raw: fileContent, format: 'text' };
        }
      } catch (parseError) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          error: 'Invalid file content',
          details: parseError.message
        });
      }

      // Create a real extraction record in the database for the uploaded data
      const { Extraction } = require('../services/models');
      
      const extraction = await Extraction.create({
        type: dataType,
        status: 'completed',
        organizationId: req.organizationId,
        startDate: parsedMetadata.startDate || new Date(),
        endDate: parsedMetadata.endDate || new Date(),
        itemsExtracted: Array.isArray(parsedData) ? parsedData.length : 1,
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
        extractionId: extraction.id,
        data: parsedData,
        uploadedFile: {
          path: req.file.path,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype
        }
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
        }
      });

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

// Get uploaded data for analysis (internal endpoint for analyzer service)
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
    try {
      const { extractionId } = req.params;
      
      // First check memory cache
      const uploadedExtractions = req.app.locals.uploadedExtractions || {};
      let extraction = uploadedExtractions[extractionId];
      
      if (!extraction) {
        // Check database for the extraction
        const { Extraction } = require('../services/models');
        const dbExtraction = await Extraction.findByPk(extractionId);
        
        if (!dbExtraction || !dbExtraction.parameters?.isUpload) {
          return res.status(404).json({
            error: 'Uploaded extraction not found'
          });
        }
        
        // Try to read the file from disk
        const filePath = dbExtraction.parameters.uploadedFile?.path;
        if (!filePath) {
          return res.status(404).json({
            error: 'Uploaded file path not found'
          });
        }
        
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          let parsedData;
          
          if (dbExtraction.parameters.uploadedFile.mimeType === 'application/json' || 
              dbExtraction.parameters.uploadedFile.originalName.endsWith('.json')) {
            parsedData = JSON.parse(fileContent);
          } else {
            parsedData = { raw: fileContent, format: 'text' };
          }
          
          // Cache it back in memory
          uploadedExtractions[extractionId] = {
            extractionId: extractionId,
            data: parsedData,
            uploadedFile: dbExtraction.parameters.uploadedFile
          };
          
          extraction = uploadedExtractions[extractionId];
          
        } catch (fileError) {
          logger.error('Failed to read uploaded file:', fileError);
          return res.status(404).json({
            error: 'Uploaded file not accessible'
          });
        }
      }
      
      // Return the parsed data
      res.json({
        success: true,
        data: extraction.data
      });

    } catch (error) {
      logger.error('Get uploaded data error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;