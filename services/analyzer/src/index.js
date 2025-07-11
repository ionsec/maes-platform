const Queue = require('bull');
const { logger } = require('./logger');
const { sequelize, Extraction, AnalysisJob, Alert, Organization, User } = require('./models');
const JobProcessor = require('./jobProcessor');
const EnhancedAnalyzer = require('./enhancedAnalyzer');

// Initialize Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const analysisQueue = new Queue('analysis-jobs', redisUrl);
const extractionQueue = new Queue('extraction', redisUrl);

// Initialize job processor and enhanced analyzer
const jobProcessor = new JobProcessor();
const enhancedAnalyzer = new EnhancedAnalyzer();

// Initialize the analyzer service
async function initialize() {
  try {
    logger.info('Initializing MAES Analyzer Service...');

    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Initialize job processor and enhanced analyzer
    await jobProcessor.initialize();
    await enhancedAnalyzer.initialize();
    logger.info('Job processor and enhanced analyzer initialized');

    // Set up queue processors
    setupQueueProcessors();

    // Set up periodic tasks
    setupPeriodicTasks();

    logger.info('CIRA Analyzer Service initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize analyzer service:', error);
    process.exit(1);
  }
}

// Set up queue processors
function setupQueueProcessors() {
  // Analysis queue processor
  analysisQueue.process('analyze-data', async (job) => {
    try {
      logger.info(`Processing analysis job: ${job.id}`);
      
      const { analysisId, extractionId, organizationId, analysisType, type, parameters } = job.data;
      
      // Use either analysisType or type (for consistency)
      const actualAnalysisType = analysisType || type || 'ual_analysis';
      
      // If we have an analysisId from the database, use it; otherwise create one
      const actualAnalysisId = analysisId || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add job to multi-threaded processor
      await jobProcessor.addJob('analysis', {
        id: actualAnalysisId,
        analysisId: actualAnalysisId,
        extractionId,
        organizationId,
        analysisType: actualAnalysisType,
        parameters: {
          ...parameters,
          priority: parameters?.priority || 'medium'
        },
        priority: parameters?.priority || 'medium'
      });

      return { success: true, message: 'Analysis job queued for processing' };

    } catch (error) {
      logger.error(`Analysis job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Extraction queue processor
  extractionQueue.process(async (job) => {
    try {
      logger.info(`Processing extraction job: ${job.id}`);
      
      const { extractionId, organizationId, extractionType, parameters } = job.data;
      
      // Add job to multi-threaded processor
      await jobProcessor.addJob('extraction', {
        id: extractionId,
        extractionId,
        organizationId,
        extractionType,
        parameters,
        priority: parameters?.priority || 'medium'
      });

      return { success: true, message: 'Extraction job queued for processing' };

    } catch (error) {
      logger.error(`Extraction job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Handle queue events
  analysisQueue.on('completed', (job, result) => {
    logger.info(`Analysis job ${job.id} completed:`, result);
  });

  analysisQueue.on('failed', (job, err) => {
    logger.error(`Analysis job ${job.id} failed:`, err);
  });

  extractionQueue.on('completed', (job, result) => {
    logger.info(`Extraction job ${job.id} completed:`, result);
  });

  extractionQueue.on('failed', (job, err) => {
    logger.error(`Extraction job ${job.id} failed:`, err);
  });

  logger.info('Queue processors set up successfully');
}

// Set up periodic tasks
function setupPeriodicTasks() {
  // Health check every 30 seconds
  setInterval(async () => {
    try {
      const status = jobProcessor.getStatus();
      logger.info('Analyzer service health check:', status);
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }, 30000);

  // Clean up old jobs every hour
  setInterval(async () => {
    try {
      await cleanupOldJobs();
    } catch (error) {
      logger.error('Job cleanup failed:', error);
    }
  }, 3600000);

  logger.info('Periodic tasks set up successfully');
}

// Clean up old jobs
async function cleanupOldJobs() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Clean up old analysis jobs
    const deletedAnalysisJobs = await AnalysisJob.destroy({
      where: {
        createdAt: {
          [sequelize.Op.lt]: thirtyDaysAgo
        },
        status: ['completed', 'failed']
      }
    });

    // Clean up old extractions
    const deletedExtractions = await Extraction.destroy({
      where: {
        createdAt: {
          [sequelize.Op.lt]: thirtyDaysAgo
        },
        status: ['completed', 'failed']
      }
    });

    logger.info(`Cleaned up ${deletedAnalysisJobs} analysis jobs and ${deletedExtractions} extractions`);
  } catch (error) {
    logger.error('Failed to cleanup old jobs:', error);
  }
}

// Enhanced analysis functions for MSSP platform
async function analyzeAzureAuditLogs(auditData, parameters) {
  const findings = [];
  const statistics = {
    totalEvents: auditData.length,
    uniqueUsers: new Set(),
    uniqueOperations: new Set(),
    failedOperations: 0,
    suspiciousActivities: 0,
    highSeverityEvents: 0
  };

  // Analyze each audit log entry
  for (const event of auditData) {
    // Extract user and operation info
    const user = event.UserId || event.UserPrincipalName || 'Unknown';
    const operation = event.Operation || 'Unknown';
    const result = event.ResultStatus || 'Success';
    const timestamp = new Date(event.CreationTime || event.TimeGenerated);
    const ipAddress = event.ClientIP || event.IPAddress;
    const userAgent = event.UserAgent || event.ClientAppUsed;

    // Update statistics
    statistics.uniqueUsers.add(user);
    statistics.uniqueOperations.add(operation);

    if (result !== 'Success') {
      statistics.failedOperations++;
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /failed/i, severity: 'medium', type: 'failed_operation' },
      { pattern: /unauthorized/i, severity: 'high', type: 'unauthorized_access' },
      { pattern: /privilege/i, severity: 'high', type: 'privilege_escalation' },
      { pattern: /admin/i, severity: 'medium', type: 'admin_activity' },
      { pattern: /delete/i, severity: 'medium', type: 'deletion_activity' }
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.pattern.test(operation) || pattern.pattern.test(result)) {
        statistics.suspiciousActivities++;
        
        if (pattern.severity === 'high') {
          statistics.highSeverityEvents++;
        }

        findings.push({
          id: `finding_${findings.length + 1}`,
          title: `${pattern.type.replace('_', ' ')} detected`,
          severity: pattern.severity,
          description: `Suspicious activity detected: ${operation} by ${user}`,
          timestamp: timestamp,
          source: 'azure_audit_logs',
          details: {
            user: user,
            operation: operation,
            result: result,
            ipAddress: ipAddress,
            userAgent: userAgent,
            pattern: pattern.type
          }
        });
      }
    }

    // Check for unusual time patterns (outside business hours)
    const hour = timestamp.getHours();
    if (hour < 6 || hour > 22) {
      findings.push({
        id: `finding_${findings.length + 1}`,
        title: 'Activity outside business hours',
        severity: 'medium',
        description: `User ${user} performed ${operation} outside business hours`,
        timestamp: timestamp,
        source: 'azure_audit_logs',
        details: {
          user: user,
          operation: operation,
          hour: hour,
          timeCategory: 'after_hours'
        }
      });
    }

    // Check for multiple failed operations
    if (result !== 'Success') {
      const recentFailures = auditData.filter(e => 
        e.UserId === user && 
        e.ResultStatus !== 'Success' &&
        Math.abs(new Date(e.CreationTime) - timestamp) < 3600000 // 1 hour
      );

      if (recentFailures.length > 3) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Multiple failed operations',
          severity: 'high',
          description: `User ${user} had ${recentFailures.length} failed operations in the last hour`,
          timestamp: timestamp,
          source: 'azure_audit_logs',
          details: {
            user: user,
            failureCount: recentFailures.length,
            timeWindow: '1 hour'
          }
        });
      }
    }
  }

  // Convert sets to counts
  statistics.uniqueUsers = statistics.uniqueUsers.size;
  statistics.uniqueOperations = statistics.uniqueOperations.size;

  return {
    findings: findings,
    statistics: statistics,
    summary: {
      totalFindings: findings.length,
      highSeverityFindings: findings.filter(f => f.severity === 'high').length,
      mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
      lowSeverityFindings: findings.filter(f => f.severity === 'low').length
    }
  };
}

// Enhanced alert generation for MSSP platform
async function generateAlerts(findings, parameters) {
  const alerts = [];
  const axios = require('axios');
  
  try {
    // Convert findings to alerts
    for (const finding of findings) {
      // Only create alerts for high and critical severity findings
      if (finding.severity === 'high' || finding.severity === 'critical') {
        const alertData = {
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          source: finding.source,
          status: 'new',
          organizationId: parameters.organizationId || '00000000-0000-0000-0000-000000000001',
          analysisId: parameters.analysisId,
          extractionId: parameters.extractionId,
          data: {
            finding: finding,
            timestamp: finding.timestamp,
            details: finding.details
          }
        };
        
        try {
          // Create the alert via API call
          const response = await axios.post('http://api:3000/api/alerts', alertData, {
            headers: {
              'x-service-token': process.env.SERVICE_AUTH_TOKEN,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          
          if (response.data && response.data.success) {
            alerts.push(response.data.alert);
            logger.info(`Created alert: ${alertData.title} (${alertData.severity})`);
          }
        } catch (apiError) {
          logger.error(`Failed to create alert via API: ${apiError.message}`);
        }
      }
    }
    
    logger.info(`Generated ${alerts.length} alerts from ${findings.length} findings`);
    
  } catch (error) {
    logger.error('Error generating alerts:', error);
  }
  
  return alerts;
}

// Enhanced uploaded extraction processing
async function processUploadedExtraction(extractionId, analysisType, job) {
  try {
    logger.info(`Processing uploaded extraction for analysis type: ${analysisType}`);
    
    const { analysisId, organizationId, parameters } = job.data;
    
    // Update database progress
    const analysisJob = await AnalysisJob.findByPk(analysisId);
    if (analysisJob) {
      analysisJob.progress = 30;
      await analysisJob.save();
    }
    
    // Since the analyzer service runs in a separate container, we need to fetch the data
    // from the API service instead of reading the file directly
    let auditData;
    try {
      // Make a request to the API to get the uploaded data with service authentication
      const axios = require('axios');
      const response = await axios.get(`http://api:3000/api/upload/data/${extractionId}`, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN
        },
        timeout: 30000 // 30 second timeout
      });
      
      if (response.data && response.data.success) {
        auditData = response.data.data;
        logger.info(`Successfully fetched uploaded data: ${auditData.length} entries`);
      } else {
        throw new Error('Failed to fetch uploaded data from API');
      }
    } catch (apiError) {
      logger.error('Failed to fetch uploaded data:', apiError.message);
      throw new Error(`Failed to fetch uploaded data: ${apiError.message}`);
    }
    
    await job.progress(50);
    
    if (analysisJob) {
      analysisJob.progress = 50;
      await analysisJob.save();
    }
    
    // Analyze the audit data using enhanced analyzer
    const analysisResult = await enhancedAnalyzer.analyzeEntraAuditLogs(auditData, {
      analysisId,
      extractionId,
      organizationId: organizationId || '00000000-0000-0000-0000-000000000001'
    });
    
    await job.progress(80);
    
    if (analysisJob) {
      analysisJob.progress = 80;
      await analysisJob.save();
    }
    
    // Generate alerts if needed
    const alertParameters = {
      analysisId,
      extractionId,
      organizationId: organizationId || '00000000-0000-0000-0000-000000000001'
    };
    const alerts = await generateAlerts(analysisResult.findings, alertParameters);
    
    // Update database job status to completed
    if (analysisJob) {
      analysisJob.progress = 100;
      analysisJob.status = 'completed';
      analysisJob.completedAt = new Date();
      analysisJob.results = {
        summary: analysisResult.summary,
        findings: analysisResult.findings,
        statistics: analysisResult.statistics,
        recommendations: generateRecommendations(analysisResult)
      };
      analysisJob.alerts = alerts;
      await analysisJob.save();
    }
    
    logger.info(`Analysis completed for extraction ${extractionId}: ${analysisResult.findings.length} findings, ${alerts.length} alerts`);
    
    return {
      success: true,
      findings: analysisResult.findings,
      alerts: alerts,
      statistics: analysisResult.statistics
    };
    
  } catch (error) {
    logger.error(`Analysis job ${analysisId} failed:`, error);
    
    // Update job status to failed
    const analysisJob = await AnalysisJob.findByPk(analysisId);
    if (analysisJob) {
      analysisJob.status = 'failed';
      analysisJob.errorMessage = error.message;
      analysisJob.errorDetails = error;
      await analysisJob.save();
    }
    
    throw error;
  }
}

// Generate recommendations based on analysis results
function generateRecommendations(analysisResult) {
  const recommendations = [];
  
  if (analysisResult.statistics.failedOperations > 0) {
    recommendations.push({
      type: 'security',
      priority: 'high',
      title: 'Review failed authentication attempts',
      description: `Found ${analysisResult.statistics.failedOperations} failed operations. Review for potential brute force attacks.`,
      action: 'Investigate failed login patterns and consider implementing account lockout policies.'
    });
  }
  
  if (analysisResult.statistics.highSeverityEvents > 0) {
    recommendations.push({
      type: 'security',
      priority: 'critical',
      title: 'Address high severity security events',
      description: `Found ${analysisResult.statistics.highSeverityEvents} high severity events requiring immediate attention.`,
      action: 'Review and respond to all high severity findings immediately.'
    });
  }
  
  if (analysisResult.findings.filter(f => f.details?.timeCategory === 'after_hours').length > 0) {
    recommendations.push({
      type: 'monitoring',
      priority: 'medium',
      title: 'Monitor after-hours activity',
      description: 'Detected activity outside normal business hours.',
      action: 'Implement monitoring for unusual time patterns and consider geo-fencing.'
    });
  }
  
  return recommendations;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  try {
    await jobProcessor.shutdown();
    await analysisQueue.close();
    await extractionQueue.close();
    await sequelize.close();
    
    logger.info('Analyzer service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the service
initialize().catch(error => {
  logger.error('Failed to start analyzer service:', error);
  process.exit(1);
});