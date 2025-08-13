const { Worker, Queue } = require('bullmq');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('./logger');
const { sequelize } = require('./models');
const assessmentEngine = require('./services/assessmentEngine');
const scheduler = require('./services/scheduler');
const reportGenerator = require('./services/reportGenerator');

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD
};

// Initialize Redis queues
const complianceQueue = new Queue('compliance-assessments', {
  connection: redisConnection
});

// Workers
let complianceWorker;

// Express app for API endpoints
const app = express();
const PORT = process.env.COMPLIANCE_PORT || 3002;

app.use(express.json());

// Ensure reports directory exists - must match reportGenerator.js location
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdir(REPORTS_DIR, { recursive: true }).catch(err => 
  logger.error('Failed to create reports directory:', err)
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'compliance',
    timestamp: new Date().toISOString()
  });
});

// Middleware to validate service token
const validateServiceToken = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.SERVICE_AUTH_TOKEN;
  
  if (!serviceToken || serviceToken !== expectedToken) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  
  next();
};

// Start compliance assessment endpoint
app.post('/api/assessment/start', validateServiceToken, async (req, res) => {
  try {
    const {
      organizationId,
      credentials,
      assessmentType = 'cis_v400',
      options = {}
    } = req.body;

    if (!organizationId || !credentials) {
      return res.status(400).json({
        error: 'Missing required parameters: organizationId and credentials'
      });
    }

    // Add job to queue
    const job = await complianceQueue.add('run-assessment', {
      organizationId,
      credentials,
      assessmentType,
      options
    }, {
      priority: options.priority || 10,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });

    logger.info(`Queued compliance assessment job: ${job.id} for organization: ${organizationId}`);

    res.json({
      success: true,
      jobId: job.id,
      message: 'Compliance assessment queued successfully'
    });

  } catch (error) {
    logger.error('Failed to start compliance assessment:', error);
    res.status(500).json({
      error: 'Failed to start assessment',
      message: error.message
    });
  }
});

// Get assessment status endpoint
app.get('/api/assessment/:assessmentId', validateServiceToken, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { ComplianceAssessment, ComplianceResult } = require('./models');

    const assessment = await ComplianceAssessment.findByPk(assessmentId, {
      include: [{
        model: ComplianceResult,
        as: 'results'
      }]
    });

    if (!assessment) {
      return res.status(404).json({
        error: 'Assessment not found'
      });
    }

    res.json({
      success: true,
      assessment: assessment
    });

  } catch (error) {
    logger.error('Failed to get assessment status:', error);
    res.status(500).json({
      error: 'Failed to get assessment status',
      message: error.message
    });
  }
});

// Schedule management endpoints
app.post('/api/schedule', validateServiceToken, async (req, res) => {
  try {
    const schedule = await scheduler.createSchedule(req.body);
    res.json({
      success: true,
      schedule: schedule
    });
  } catch (error) {
    logger.error('Failed to create schedule:', error);
    res.status(500).json({
      error: 'Failed to create schedule',
      message: error.message
    });
  }
});

app.get('/api/schedules/:organizationId', validateServiceToken, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { ComplianceSchedule } = require('./models');

    const schedules = await ComplianceSchedule.findAll({
      where: { organization_id: organizationId },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      schedules: schedules
    });
  } catch (error) {
    logger.error('Failed to get schedules:', error);
    res.status(500).json({
      error: 'Failed to get schedules',
      message: error.message
    });
  }
});

app.put('/api/schedule/:scheduleId', validateServiceToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const schedule = await scheduler.updateSchedule(scheduleId, req.body);
    res.json({
      success: true,
      schedule: schedule
    });
  } catch (error) {
    logger.error('Failed to update schedule:', error);
    res.status(500).json({
      error: 'Failed to update schedule',
      message: error.message
    });
  }
});

app.delete('/api/schedule/:scheduleId', validateServiceToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    await scheduler.deleteSchedule(scheduleId);
    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete schedule:', error);
    res.status(500).json({
      error: 'Failed to delete schedule',
      message: error.message
    });
  }
});

app.get('/api/scheduler/stats', validateServiceToken, async (req, res) => {
  try {
    const stats = await scheduler.getScheduleStats();
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Failed to get scheduler stats:', error);
    res.status(500).json({
      error: 'Failed to get scheduler stats',
      message: error.message
    });
  }
});

// Report generation endpoints
app.post('/api/assessment/:assessmentId/report', validateServiceToken, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { format = 'html', type = 'full', options = {} } = req.body;

    logger.info(`Generating ${format} report for assessment ${assessmentId}`);

    // Check if assessment exists and is completed
    const { ComplianceAssessment } = require('./models');
    const assessment = await ComplianceAssessment.findByPk(assessmentId);
    
    if (!assessment) {
      return res.status(404).json({
        error: 'Assessment not found'
      });
    }

    if (assessment.status !== 'completed') {
      return res.status(400).json({
        error: 'Assessment must be completed before generating report'
      });
    }

    let reportResult;
    
    // Generate report based on type
    if (type === 'executive') {
      reportResult = await reportGenerator.generateExecutiveSummary(assessmentId, options);
    } else {
      reportResult = await reportGenerator.generateReport(assessmentId, format, options);
    }

    // Store report metadata in database
    const { query } = require('./services/database');
    await query(
      `INSERT INTO maes.compliance_reports 
       (id, assessment_id, organization_id, format, type, file_path, file_name, file_size, status, created_at) 
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'completed', NOW())`,
      [
        assessmentId,
        assessment.organization_id,
        reportResult.format || format,
        type,
        reportResult.filePath,
        reportResult.fileName,
        reportResult.size
      ]
    );

    res.json({
      success: true,
      report: {
        assessmentId,
        format: reportResult.format || format,
        type,
        fileName: reportResult.fileName,
        size: reportResult.size,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error(`Failed to generate report for assessment ${req.params.assessmentId}:`, error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

app.get('/api/assessment/:assessmentId/reports', validateServiceToken, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    
    // Get all reports for this assessment
    const { getRows } = require('./services/database');
    const reports = await getRows(
      `SELECT * FROM maes.compliance_reports 
       WHERE assessment_id = $1 
       ORDER BY created_at DESC`,
      [assessmentId]
    );

    res.json({
      success: true,
      reports: reports || []
    });

  } catch (error) {
    logger.error(`Failed to get reports for assessment ${req.params.assessmentId}:`, error);
    res.status(500).json({
      error: 'Failed to get reports',
      message: error.message
    });
  }
});

app.get('/api/assessment/:assessmentId/report/:fileName/download', validateServiceToken, async (req, res) => {
  try {
    const { assessmentId, fileName } = req.params;
    
    // Verify the report exists in database
    const { getRow } = require('./services/database');
    const report = await getRow(
      `SELECT * FROM maes.compliance_reports 
       WHERE assessment_id = $1 AND file_name = $2`,
      [assessmentId, fileName]
    );

    if (!report) {
      return res.status(404).json({
        error: 'Report not found'
      });
    }

    // Check if file exists
    const filePath = path.join(REPORTS_DIR, fileName);
    try {
      await fs.access(filePath);
    } catch (err) {
      logger.error(`Report file not found: ${filePath}`);
      return res.status(404).json({
        error: 'Report file not found'
      });
    }

    // Read and send file
    const fileContent = await fs.readFile(filePath);
    
    // Set appropriate content type based on format
    let contentType = 'application/octet-stream';
    if (report.format === 'html') contentType = 'text/html';
    else if (report.format === 'json') contentType = 'application/json';
    else if (report.format === 'csv') contentType = 'text/csv';
    else if (report.format === 'pdf') contentType = 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileContent.length);
    
    res.send(fileContent);

  } catch (error) {
    logger.error(`Failed to download report:`, error);
    res.status(500).json({
      error: 'Failed to download report',
      message: error.message
    });
  }
});

// Initialize the compliance service
async function initialize() {
  try {
    logger.info('Initializing MAES Compliance Service...');

    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Initialize scheduler
    await scheduler.initialize();
    logger.info('Compliance scheduler initialized');

    // Initialize report generator
    await reportGenerator.initialize();
    logger.info('Report generator initialized');

    // Set up queue processors
    setupQueueProcessors();

    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Compliance service API listening on port ${PORT}`);
    });

    // Set up periodic tasks
    setupPeriodicTasks();

    logger.info('MAES Compliance Service initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize compliance service:', error);
    process.exit(1);
  }
}

// Set up queue processors
function setupQueueProcessors() {
  // Compliance assessment worker
  complianceWorker = new Worker('compliance-assessments', async (job) => {
    try {
      logger.info(`Processing compliance assessment job: ${job.id}`);
      
      const { organizationId, credentials, assessmentType, options } = job.data;
      
      // Update job progress
      await job.updateProgress(10);
      
      // Run the assessment
      const result = await assessmentEngine.runAssessment(
        organizationId,
        credentials,
        assessmentType,
        {
          ...options,
          jobId: job.id
        }
      );
      
      await job.updateProgress(100);
      
      logger.info(`Compliance assessment completed: ${result.assessmentId}`);
      
      return {
        success: true,
        assessmentId: result.assessmentId,
        overallScore: result.overallScore,
        weightedScore: result.weightedScore,
        statistics: result.statistics
      };

    } catch (error) {
      logger.error(`Compliance assessment job ${job.id} failed:`, error);
      throw error;
    }
  }, { 
    connection: redisConnection,
    concurrency: 2 // Limit concurrent assessments
  });

  // Handle worker events
  complianceWorker.on('completed', (job, result) => {
    logger.info(`Compliance assessment job ${job.id} completed:`, result);
  });

  complianceWorker.on('failed', (job, err) => {
    logger.error(`Compliance assessment job ${job.id} failed:`, err);
  });

  complianceWorker.on('progress', (job, progress) => {
    logger.debug(`Compliance assessment job ${job.id} progress: ${progress}%`);
  });

  logger.info('Queue processors set up successfully');
}

// Set up periodic tasks
function setupPeriodicTasks() {
  // Health check every 30 seconds
  setInterval(async () => {
    try {
      const queueHealth = await complianceQueue.getWaiting();
      logger.debug(`Compliance service health check - Waiting jobs: ${queueHealth.length}`);
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }, 30000);

  // Clean up old completed jobs every hour
  setInterval(async () => {
    try {
      await complianceQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // 24 hours
      await complianceQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'); // 7 days
      logger.debug('Cleaned up old compliance jobs');
    } catch (error) {
      logger.error('Job cleanup failed:', error);
    }
  }, 3600000);

  // Clean up old reports every day
  setInterval(async () => {
    try {
      const deletedCount = await reportGenerator.cleanupOldReports(30 * 24 * 60 * 60 * 1000); // 30 days
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old report files`);
      }
    } catch (error) {
      logger.error('Report cleanup failed:', error);
    }
  }, 24 * 60 * 60 * 1000); // Daily

  logger.info('Periodic tasks set up successfully');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  try {
    await complianceWorker.close();
    await complianceQueue.close();
    await scheduler.shutdown();
    await sequelize.close();
    
    logger.info('Compliance service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  try {
    await complianceWorker.close();
    await complianceQueue.close();
    await scheduler.shutdown();
    await sequelize.close();
    
    logger.info('Compliance service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the service
initialize().catch(error => {
  logger.error('Failed to start compliance service:', error);
  process.exit(1);
});