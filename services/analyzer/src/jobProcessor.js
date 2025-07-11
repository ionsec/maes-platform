const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { logger } = require('./logger');
const { sequelize, Extraction, AnalysisJob, Alert, Organization } = require('./models');

class JobProcessor {
  constructor() {
    this.workers = new Map();
    this.maxWorkers = process.env.MAX_WORKERS || Math.max(1, os.cpus().length - 1);
    this.activeJobs = new Map();
    this.jobQueue = [];
    this.isProcessing = false;
  }

  // Initialize the job processor
  async initialize() {
    logger.info(`Initializing job processor with ${this.maxWorkers} workers`);
    
    // Create worker pool
    for (let i = 0; i < this.maxWorkers; i++) {
      await this.createWorker(i);
    }

    // Start processing loop
    this.startProcessingLoop();
    
    logger.info('Job processor initialized successfully');
  }

  // Create a new worker
  async createWorker(workerId) {
    try {
      logger.info(`Creating worker ${workerId}...`);
      
      const worker = new Worker(__filename, {
        workerData: { workerId, type: 'job_processor' }
      });

      worker.on('message', (message) => {
        logger.info(`Worker ${workerId} sent message:`, message.type);
        this.handleWorkerMessage(workerId, message);
      });

      worker.on('error', (error) => {
        logger.error(`Worker ${workerId} error:`, error);
        this.handleWorkerError(workerId, error);
      });

      worker.on('exit', (code) => {
        logger.warn(`Worker ${workerId} exited with code ${code}`);
        this.handleWorkerExit(workerId, code);
      });

      this.workers.set(workerId, worker);
      logger.info(`Created worker ${workerId} successfully`);

    } catch (error) {
      logger.error(`Failed to create worker ${workerId}:`, error);
      throw error;
    }
  }

  // Handle messages from workers
  handleWorkerMessage(workerId, message) {
    const { type, jobId, data, error } = message;

    switch (type) {
      case 'job_started':
        logger.info(`Worker ${workerId} started job ${jobId}`);
        this.activeJobs.set(jobId, workerId);
        break;

      case 'job_progress':
        this.updateJobProgress(jobId, data.progress, data.message);
        break;

      case 'job_completed':
        logger.info(`Worker ${workerId} completed job ${jobId}`);
        this.handleJobCompletion(jobId, data);
        this.activeJobs.delete(jobId);
        break;

      case 'job_failed':
        logger.error(`Worker ${workerId} failed job ${jobId}:`, error);
        this.handleJobFailure(jobId, error);
        this.activeJobs.delete(jobId);
        break;

      case 'worker_ready':
        logger.info(`Worker ${workerId} is ready for new jobs`);
        this.processNextJob();
        break;
    }
  }

  // Handle worker errors
  handleWorkerError(workerId, error) {
    logger.error(`Worker ${workerId} encountered an error:`, error);
    
    // Remove worker and recreate it
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      this.workers.delete(workerId);
      this.createWorker(workerId);
    }
  }

  // Handle worker exit
  handleWorkerExit(workerId, code) {
    logger.warn(`Worker ${workerId} exited with code ${code}`);
    
    // Remove worker and recreate it if it was unexpected
    if (code !== 0) {
      this.workers.delete(workerId);
      this.createWorker(workerId);
    }
  }

  // Add job to queue
  async addJob(jobType, jobData) {
    const job = {
      id: jobData.id || `${jobType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      data: jobData,
      priority: jobData.priority || 'medium',
      createdAt: new Date()
    };

    this.jobQueue.push(job);
    
    // Sort queue by priority
    this.jobQueue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    logger.info(`Added job ${job.id} to queue (${this.jobQueue.length} jobs in queue)`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }
  }

  // Start processing loop
  startProcessingLoop() {
    this.isProcessing = true;
    this.processNextJob();
  }

  // Process next job in queue
  async processNextJob() {
    logger.info(`Processing next job. Queue length: ${this.jobQueue.length}, Active jobs: ${this.activeJobs.size}`);
    
    if (this.jobQueue.length === 0) {
      logger.info('No jobs in queue, stopping processing');
      this.isProcessing = false;
      return;
    }

    // Find available worker
    const availableWorker = this.findAvailableWorker();
    if (availableWorker === null) {
      logger.info('No workers available, waiting 1 second and retrying');
      // No workers available, wait and try again
      setTimeout(() => this.processNextJob(), 1000);
      return;
    }

    // Get next job
    const job = this.jobQueue.shift();
    if (!job) {
      logger.info('No job found in queue, stopping processing');
      this.isProcessing = false;
      return;
    }

    logger.info(`Sending job ${job.id} to worker ${availableWorker}`);

    // Send job to worker
    const worker = this.workers.get(availableWorker);
    if (worker) {
      try {
        worker.postMessage({
          type: 'process_job',
          job: job
        });
        logger.info(`Job ${job.id} sent to worker ${availableWorker}`);
      } catch (error) {
        logger.error(`Failed to send job ${job.id} to worker ${availableWorker}:`, error);
        // Put job back in queue
        this.jobQueue.unshift(job);
      }
    } else {
      logger.error(`Worker ${availableWorker} not found`);
      // Put job back in queue
      this.jobQueue.unshift(job);
    }

    // Continue processing
    this.processNextJob();
  }

  // Find available worker
  findAvailableWorker() {
    const activeWorkerIds = Array.from(this.activeJobs.values());
    logger.info(`Finding available worker. Active workers: [${activeWorkerIds.join(', ')}], Total workers: ${this.maxWorkers}`);
    
    for (let i = 0; i < this.maxWorkers; i++) {
      if (!activeWorkerIds.includes(i) && this.workers.has(i)) {
        logger.info(`Found available worker: ${i}`);
        return i;
      }
    }
    
    logger.info('No available workers found');
    return null;
  }

  // Update job progress
  async updateJobProgress(jobId, progress, message) {
    try {
      // Use direct SQL for more reliable updates
      const { execute, getRow } = require('./services/database');
      
      // First check if the job exists
      const jobExists = await getRow('SELECT id FROM maes.analysis_jobs WHERE id = $1', [jobId]);
      
      if (jobExists) {
        await execute(
          'UPDATE maes.analysis_jobs SET progress = $1, status = $2, updated_at = NOW() WHERE id = $3',
          [progress, progress === 100 ? 'completed' : 'running', jobId]
        );
        logger.info(`Updated job ${jobId} progress: ${progress}% - ${message || ''}`);
      } else {
        logger.warn(`Job ${jobId} not found in database for progress update`);
      }
    } catch (error) {
      logger.error(`Failed to update job progress for ${jobId}:`, error);
    }
  }

  // Handle job completion
  async handleJobCompletion(jobId, data) {
    try {
      // Use direct SQL for more reliable updates
      const { execute, getRow } = require('./services/database');
      
      // First check if the job exists
      const jobExists = await getRow('SELECT id FROM maes.analysis_jobs WHERE id = $1', [jobId]);
      
      if (jobExists) {
        await execute(
          'UPDATE maes.analysis_jobs SET status = $1, progress = $2, completed_at = $3, results = $4, alerts = $5, updated_at = NOW() WHERE id = $6',
          ['completed', 100, new Date().toISOString(), JSON.stringify(data.results), JSON.stringify(data.alerts), jobId]
        );
        logger.info(`Completed job ${jobId} with ${data.results?.findings?.length || 0} findings and ${data.alerts?.length || 0} alerts`);
      } else {
        logger.warn(`Job ${jobId} not found in database for completion update`);
      }
    } catch (error) {
      logger.error(`Failed to handle job completion for ${jobId}:`, error);
    }
  }

  // Handle job failure
  async handleJobFailure(jobId, error) {
    try {
      // Use direct SQL for more reliable updates
      const { execute, getRow } = require('./services/database');
      
      // First check if the job exists
      const jobExists = await getRow('SELECT id FROM maes.analysis_jobs WHERE id = $1', [jobId]);
      
      if (jobExists) {
        await execute(
          'UPDATE maes.analysis_jobs SET status = $1, error_message = $2, error_details = $3, updated_at = NOW() WHERE id = $4',
          ['failed', error.message, JSON.stringify(error), jobId]
        );
        logger.error(`Failed job ${jobId}: ${error.message}`);
      } else {
        logger.warn(`Job ${jobId} not found in database for failure update`);
      }
    } catch (updateError) {
      logger.error(`Failed to handle job failure for ${jobId}:`, updateError);
    }
  }

  // Get processor status
  getStatus() {
    return {
      workers: this.maxWorkers,
      activeWorkers: this.activeJobs.size,
      queueLength: this.jobQueue.length,
      activeJobs: Array.from(this.activeJobs.keys()),
      isProcessing: this.isProcessing
    };
  }

  // Shutdown processor
  async shutdown() {
    logger.info('Shutting down job processor...');
    
    // Terminate all workers
    for (const [workerId, worker] of this.workers) {
      worker.terminate();
    }
    
    this.workers.clear();
    this.activeJobs.clear();
    this.jobQueue = [];
    this.isProcessing = false;
    
    logger.info('Job processor shutdown complete');
  }
}

// Worker thread code
if (!isMainThread && workerData.type === 'job_processor') {
  const { workerId } = workerData;
  
  // Import required modules in worker context
  let sequelize, Extraction, AnalysisJob, Alert, Organization, EnhancedAnalyzer;
  
  // Initialize database connection in worker context
  try {
    const models = require('./models');
    sequelize = models.sequelize;
    Extraction = models.Extraction;
    AnalysisJob = models.AnalysisJob;
    Alert = models.Alert;
    Organization = models.Organization;
    
    // Initialize enhanced analyzer
    const EnhancedAnalyzerClass = require('./enhancedAnalyzer');
    EnhancedAnalyzer = new EnhancedAnalyzerClass();
    
    // Test database connection and initialize enhanced analyzer
    sequelize.authenticate().then(async () => {
      console.log(`Worker ${workerId}: Database connection established`);
      await EnhancedAnalyzer.initialize();
      console.log(`Worker ${workerId}: Enhanced analyzer initialized`);
    }).catch(err => {
      console.error(`Worker ${workerId}: Database connection failed:`, err);
    });
    
  } catch (error) {
    console.error(`Worker ${workerId}: Failed to initialize models:`, error);
    process.exit(1);
  }
  
  // Analysis functions for worker context
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

    // Log analysis start for monitoring
    console.log(`Worker ${workerId}: Starting analysis of ${auditData.length} events`);

    // Analyze each audit log entry
    for (const event of auditData) {
      // Extract user and operation info - support both formats
      const user = event.UserId || event.UserPrincipalName || 
                   event.initiatedBy?.user?.userPrincipalName || 
                   event.initiatedBy?.user?.displayName || 
                   'Unknown';
      const operation = event.Operation || event.activityDisplayName || 'Unknown';
      const result = event.ResultStatus || event.result || 'Success';
      const timestamp = new Date(event.CreationTime || event.TimeGenerated || event.activityDateTime);
      const ipAddress = event.ClientIP || event.IPAddress || 
                       event.initiatedBy?.user?.ipAddress || 
                       event.location?.countryOrRegion || 'Unknown';
      const userAgent = event.UserAgent || event.ClientAppUsed || 
                       event.initiatedBy?.user?.userAgent || 'Unknown';

      // Update statistics
      statistics.uniqueUsers.add(user);
      statistics.uniqueOperations.add(operation);

      if (result !== 'Success' && result !== 'success') {
        statistics.failedOperations++;
      }

      // Check for suspicious patterns
      const suspiciousPatterns = [
        { pattern: /failed?/i, severity: 'medium', type: 'failed_operation' },
        { pattern: /failure/i, severity: 'medium', type: 'failed_operation' },
        { pattern: /error/i, severity: 'medium', type: 'error_operation' },
        { pattern: /unauthorized/i, severity: 'high', type: 'unauthorized_access' },
        { pattern: /privilege/i, severity: 'high', type: 'privilege_escalation' },
        { pattern: /admin/i, severity: 'medium', type: 'admin_activity' },
        { pattern: /delete/i, severity: 'medium', type: 'deletion_activity' },
        { pattern: /update.*user/i, severity: 'low', type: 'user_modification' },
        { pattern: /create.*user/i, severity: 'low', type: 'user_creation' },
        { pattern: /remove.*user/i, severity: 'medium', type: 'user_deletion' }
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
            type: pattern.type,
            category: 'security',
            affectedEntities: {
              users: [user],
              resources: [],
              applications: [operation],
              ipAddresses: ipAddress !== 'Unknown' ? [ipAddress] : []
            },
            evidence: {
              operation: operation,
              result: result,
              ipAddress: ipAddress,
              userAgent: userAgent,
              eventCount: 1
            },
            mitreAttack: {
              tactics: getMitreTactics(pattern.type),
              techniques: getMitreTechniques(pattern.type),
              subTechniques: getMitreSubTechniques(pattern.type)
            },
            recommendations: [
              'Investigate the source of this activity',
              'Review user access permissions',
              'Consider implementing additional monitoring'
            ],
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
          type: 'after_hours_activity',
          category: 'behavioral',
          affectedEntities: {
            users: [user],
            resources: [],
            applications: [operation],
            ipAddresses: ipAddress !== 'Unknown' ? [ipAddress] : []
          },
          evidence: {
            operation: operation,
            hour: hour,
            timeCategory: 'after_hours'
          },
          mitreAttack: {
            tactics: ['Defense Evasion', 'Persistence'],
            techniques: ['T1070', 'T1562'],
            subTechniques: ['T1070.004']
          },
          recommendations: [
            'Verify if this activity was authorized',
            'Consider implementing time-based access controls'
          ],
          details: {
            user: user,
            operation: operation,
            hour: hour,
            timeCategory: 'after_hours'
          }
        });
      }

      // Check for multiple failed operations
      if (result !== 'Success' && result !== 'success') {
        const recentFailures = auditData.filter(e => {
          const eventUser = e.UserId || e.UserPrincipalName || 
                           e.initiatedBy?.user?.userPrincipalName || 
                           e.initiatedBy?.user?.displayName || 'Unknown';
          const eventResult = e.ResultStatus || e.result || 'Success';
          const eventTime = new Date(e.CreationTime || e.TimeGenerated || e.activityDateTime);
          
          return eventUser === user && 
                 eventResult !== 'Success' && 
                 eventResult !== 'success' &&
                 Math.abs(eventTime - timestamp) < 3600000; // 1 hour
        });

        if (recentFailures.length > 3) {
          findings.push({
            id: `finding_${findings.length + 1}`,
            title: 'Multiple failed operations',
            severity: 'high',
            description: `User ${user} had ${recentFailures.length} failed operations in the last hour`,
            timestamp: timestamp,
            source: 'azure_audit_logs',
            type: 'brute_force_attempt',
            category: 'security',
            affectedEntities: {
              users: [user],
              resources: [],
              applications: recentFailures.map(f => f.Operation || f.activityDisplayName).slice(0, 5),
              ipAddresses: ipAddress !== 'Unknown' ? [ipAddress] : []
            },
            evidence: {
              failureCount: recentFailures.length,
              timeWindow: '1 hour',
              operations: recentFailures.map(f => f.Operation)
            },
            mitreAttack: {
              tactics: ['Credential Access', 'Initial Access'],
              techniques: ['T1110', 'T1078'],
              subTechniques: ['T1110.001', 'T1110.003']
            },
            recommendations: [
              'Implement account lockout policies',
              'Monitor for additional suspicious activity from this user',
              'Consider blocking IP address if pattern continues'
            ],
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

  // Generate alerts for worker context
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
              details: finding.details,
              affectedEntities: finding.affectedEntities,
              evidence: finding.evidence,
              mitreAttack: finding.mitreAttack,
              recommendations: finding.recommendations
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

  // MITRE ATT&CK mapping helper functions
  function getMitreTactics(type) {
    const mapping = {
      'failed_operation': ['Initial Access', 'Credential Access'],
      'error_operation': ['Defense Evasion'],
      'unauthorized_access': ['Initial Access', 'Privilege Escalation'],
      'privilege_escalation': ['Privilege Escalation'],
      'admin_activity': ['Privilege Escalation', 'Persistence'],
      'deletion_activity': ['Impact', 'Defense Evasion'],
      'user_modification': ['Persistence', 'Defense Evasion'],
      'user_creation': ['Persistence'],
      'user_deletion': ['Impact', 'Defense Evasion'],
      'after_hours_activity': ['Defense Evasion', 'Persistence'],
      'brute_force_attempt': ['Credential Access', 'Initial Access']
    };
    return mapping[type] || ['Defense Evasion'];
  }

  function getMitreTechniques(type) {
    const mapping = {
      'failed_operation': ['T1110', 'T1078'],
      'error_operation': ['T1562'],
      'unauthorized_access': ['T1078', 'T1134'],
      'privilege_escalation': ['T1134', 'T1068'],
      'admin_activity': ['T1078.003', 'T1098'],
      'deletion_activity': ['T1070', 'T1485'],
      'user_modification': ['T1098', 'T1136'],
      'user_creation': ['T1136'],
      'user_deletion': ['T1531', 'T1070'],
      'after_hours_activity': ['T1070', 'T1562'],
      'brute_force_attempt': ['T1110', 'T1078']
    };
    return mapping[type] || ['T1562'];
  }

  function getMitreSubTechniques(type) {
    const mapping = {
      'failed_operation': ['T1110.001', 'T1110.003'],
      'error_operation': ['T1562.001'],
      'unauthorized_access': ['T1078.003', 'T1134.001'],
      'privilege_escalation': ['T1134.001', 'T1068.001'],
      'admin_activity': ['T1078.003', 'T1098.001'],
      'deletion_activity': ['T1070.004', 'T1485.001'],
      'user_modification': ['T1098.001', 'T1136.001'],
      'user_creation': ['T1136.001'],
      'user_deletion': ['T1531.001', 'T1070.004'],
      'after_hours_activity': ['T1070.004'],
      'brute_force_attempt': ['T1110.001', 'T1110.003']
    };
    return mapping[type] || ['T1562.001'];
  }

  
  // Generate recommendations for worker context
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
  
  // Process job function
  async function processJob(job) {
    // Use the analysis job database ID, not the Bull queue job ID
    const jobId = job.data.analysisId || job.id;
    
    try {
      
      parentPort.postMessage({
        type: 'job_started',
        jobId: jobId
      });

      logger.info(`Worker ${workerId} processing job ${job.id} (${job.type})`);

      let result;
      
      switch (job.type) {
        case 'extraction':
          result = await processExtractionJob(job.data);
          break;
        case 'analysis':
          result = await processAnalysisJob(job.data, jobId);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      parentPort.postMessage({
        type: 'job_completed',
        jobId: jobId,
        data: result
      });

    } catch (error) {
      logger.error(`Worker ${workerId} failed job ${job.id}:`, error);
      
      parentPort.postMessage({
        type: 'job_failed',
        jobId: jobId,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }
  }

  // Process extraction job
  async function processExtractionJob(data) {
    const { extractionId, organizationId } = data;
    
    // Update progress
    parentPort.postMessage({
      type: 'job_progress',
      jobId: data.id,
      data: { progress: 10, message: 'Starting extraction' }
    });

    // Simulate extraction processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    parentPort.postMessage({
      type: 'job_progress',
      jobId: data.id,
      data: { progress: 50, message: 'Extracting data' }
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    parentPort.postMessage({
      type: 'job_progress',
      jobId: data.id,
      data: { progress: 90, message: 'Finalizing extraction' }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      message: 'Extraction completed successfully'
    };
  }

  // Process analysis job
  async function processAnalysisJob(data, jobId) {
    const { analysisId, extractionId, organizationId, analysisType } = data;
    
    // Update progress
    parentPort.postMessage({
      type: 'job_progress',
      jobId: jobId,
      data: { progress: 10, message: 'Starting analysis' }
    });

    try {
      // Import analysis functions
      const axios = require('axios');
      
      // Fetch extraction data
      parentPort.postMessage({
        type: 'job_progress',
        jobId: jobId,
        data: { progress: 20, message: 'Loading extraction data' }
      });

      let auditData = [];
      
      // First, try to fetch from upload endpoint (for uploaded data)
      try {
        const uploadResponse = await axios.get(`http://api:3000/api/upload/data/${extractionId}`, {
          headers: {
            'x-service-token': process.env.SERVICE_AUTH_TOKEN
          },
          timeout: 30000
        });
        
        if (uploadResponse.data && uploadResponse.data.success) {
          auditData = uploadResponse.data.data;
          logger.info(`Successfully fetched uploaded data: ${auditData.length} entries`);
        }
      } catch (uploadError) {
        // If not uploaded data, try to read from extractor output files
        logger.info('No uploaded data found, checking extractor output files...');
        
        const fs = require('fs');
        const path = require('path');
        const csvParser = require('csv-parser');
        
        // Check common output directories
        const possiblePaths = [
          `/output/${extractionId}`,
          `/extractor_output/${extractionId}`,
          `/app/output/${extractionId}`,
          `/shared/output/${extractionId}`
        ];
        
        let dataFound = false;
        
        // Log all paths being checked
        logger.info(`Looking for extraction data in paths: ${possiblePaths.join(', ')}`);
        
        for (const basePath of possiblePaths) {
          logger.info(`Checking path: ${basePath}`);
          if (fs.existsSync(basePath)) {
            logger.info(`Path exists: ${basePath}`);
            const files = fs.readdirSync(basePath);
            logger.info(`Files found in ${basePath}: ${files.join(', ')}`);
            const csvFiles = files.filter(f => f.endsWith('.csv') || f.endsWith('.json'));
            logger.info(`Data files found: ${csvFiles.join(', ')}`);
            
            for (const file of csvFiles) {
              const filePath = path.join(basePath, file);
              logger.info(`Reading extraction file: ${filePath}`);
              
              try {
                if (file.endsWith('.json')) {
                  const content = fs.readFileSync(filePath, 'utf8');
                  const jsonData = JSON.parse(content);
                  const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
                  auditData = auditData.concat(dataArray);
                  dataFound = true;
                  logger.info(`Loaded ${dataArray.length} records from ${file}`);
                } else if (file.endsWith('.csv')) {
                  // Parse CSV file
                  const results = [];
                  await new Promise((resolve, reject) => {
                    fs.createReadStream(filePath)
                      .pipe(csvParser())
                      .on('data', (data) => results.push(data))
                      .on('end', () => resolve())
                      .on('error', reject);
                  });
                  auditData = auditData.concat(results);
                  dataFound = true;
                  logger.info(`Loaded ${results.length} records from ${file}`);
                }
              } catch (fileError) {
                logger.error(`Error reading file ${filePath}: ${fileError.message}`);
                continue;
              }
            }
            
            if (dataFound) break;
          } else {
            logger.info(`Path does not exist: ${basePath}`);
          }
        }
        
        if (!dataFound) {
          throw new Error('No extraction data found. Please ensure the extraction completed successfully and data is available.');
        }
      }
      
      logger.info(`Loaded ${auditData.length} audit log entries for analysis`);
      
      parentPort.postMessage({
        type: 'job_progress',
        jobId: jobId,
        data: { progress: 40, message: 'Analyzing audit logs' }
      });

      // Analyze the audit data using the enhanced analyzer
      const analysisResult = await EnhancedAnalyzer.analyzeEntraAuditLogs(auditData, {
        analysisId,
        extractionId,
        organizationId: organizationId || '00000000-0000-0000-0000-000000000001'
      });
      
      parentPort.postMessage({
        type: 'job_progress',
        jobId: jobId,
        data: { progress: 70, message: 'Generating alerts' }
      });

      // Generate alerts
      const alertParameters = {
        analysisId,
        extractionId,
        organizationId: organizationId || '00000000-0000-0000-0000-000000000001'
      };
      const alerts = await generateAlerts(analysisResult.findings, alertParameters);
      
      parentPort.postMessage({
        type: 'job_progress',
        jobId: jobId,
        data: { progress: 90, message: 'Finalizing analysis' }
      });

      return {
        success: true,
        results: {
          summary: analysisResult.summary,
          findings: analysisResult.findings,
          statistics: analysisResult.statistics,
          recommendations: generateRecommendations(analysisResult)
        },
        alerts: alerts
      };
    } catch (error) {
      logger.error('Analysis job failed:', error);
      throw error;
    }
  }

  // Listen for messages from main thread
  parentPort.on('message', (message) => {
    if (message.type === 'process_job') {
      processJob(message.job);
    }
  });

  // Signal that worker is ready after initialization
  setTimeout(() => {
    try {
      parentPort.postMessage({
        type: 'worker_ready'
      });
      console.log(`Worker ${workerId}: Ready for jobs`);
    } catch (error) {
      console.error(`Worker ${workerId}: Failed to send ready message:`, error);
    }
  }, 1000); // Wait 1 second for database connection to be established
}

module.exports = JobProcessor; 