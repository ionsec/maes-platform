const { Queue } = require('bullmq');
const { logger } = require('../utils/logger');
const { Organization } = require('./models');

// Initialize job queues with BullMQ
const extractionQueue = new Queue('extraction-jobs', {
  connection: {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});
const analysisQueue = new Queue('analysis-jobs', {
  connection: {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Create extraction job
const createExtractionJob = async (extraction) => {
  try {
    // Get organization credentials
    const organization = await Organization.findById(extraction.organization_id);
    
    const jobData = {
      extractionId: extraction.id,
      organizationId: extraction.organization_id,
      type: extraction.type,
      parameters: {
        startDate: extraction.start_date,
        endDate: extraction.end_date,
        tenantId: organization.tenant_id,
        organization: organization.fqdn || organization.tenant_id, // Use FQDN if available, fallback to tenant_id
        ...extraction.parameters
      },
      credentials: organization.credentials
    };

    const jobOptions = {
      priority: getPriority(extraction.priority),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000 // 1 minute
      },
      removeOnComplete: 10,
      removeOnFail: 5
    };

    const job = await extractionQueue.add('extract-data', jobData, jobOptions);
    
    logger.info(`Extraction job ${extraction.id} queued with job ID ${job.id}`);
    
    return job;
  } catch (error) {
    logger.error('Failed to create extraction job:', error);
    throw error;
  }
};

// Create test connection job
const createTestConnectionJob = async (testData) => {
  try {
    const jobData = {
      testId: `test-${Date.now()}`,
      type: 'test-connection',
      organizationId: testData.organizationId,
      userId: testData.userId,
      parameters: {
        applicationId: testData.applicationId,
        fqdn: testData.fqdn,
        certificateThumbprint: testData.certificateThumbprint,
        clientSecret: testData.clientSecret
      }
    };

    const jobOptions = {
      priority: 15, // High priority for testing
      attempts: 1, // Don't retry connection tests
      removeOnComplete: 5,
      removeOnFail: 5
    };

    const job = await extractionQueue.add('test-connection', jobData, jobOptions);
    
    logger.info(`Connection test job queued with job ID ${job.id}`);
    
    return job;
  } catch (error) {
    logger.error('Failed to create test connection job:', error);
    throw error;
  }
};

// Create analysis job
const createAnalysisJob = async (analysisJob) => {
  try {
    const jobData = {
      analysisId: analysisJob.id,
      extractionId: analysisJob.extractionId,
      organizationId: analysisJob.organizationId,
      type: analysisJob.type,
      parameters: analysisJob.parameters
    };

    const jobOptions = {
      priority: getPriority(analysisJob.priority),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000 // 1 minute
      },
      removeOnComplete: 10,
      removeOnFail: 5
    };

    const job = await analysisQueue.add('analyze-data', jobData, jobOptions);
    
    logger.info(`Analysis job ${analysisJob.id} queued with job ID ${job.id}`);
    
    return job;
  } catch (error) {
    logger.error('Failed to create analysis job:', error);
    throw error;
  }
};

// Convert priority to Bull queue priority
const getPriority = (priority) => {
  const priorities = {
    'low': 1,
    'medium': 5,
    'high': 10,
    'critical': 15
  };
  return priorities[priority] || 5;
};

// Get queue statistics
const getQueueStats = async () => {
  try {
    const [extractionStats, analysisStats] = await Promise.all([
      getQueueStatistics(extractionQueue),
      getQueueStatistics(analysisQueue)
    ]);

    return {
      extraction: extractionStats,
      analysis: analysisStats
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    throw error;
  }
};

// Get statistics for a specific queue
const getQueueStatistics = async (queue) => {
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0
  };
};

// Cancel job
const cancelJob = async (jobId, queueType = 'extraction') => {
  try {
    const queue = queueType === 'extraction' ? extractionQueue : analysisQueue;
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.remove();
      logger.info(`Job ${jobId} cancelled successfully`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to cancel job:', error);
    throw error;
  }
};

// Clean up completed jobs
const cleanupJobs = async () => {
  try {
    await Promise.all([
      extractionQueue.clean(24 * 60 * 60 * 1000, 'completed'), // 24 hours
      extractionQueue.clean(24 * 60 * 60 * 1000, 'failed'),
      analysisQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      analysisQueue.clean(24 * 60 * 60 * 1000, 'failed')
    ]);
    
    logger.info('Job cleanup completed');
  } catch (error) {
    logger.error('Job cleanup failed:', error);
  }
};

// Schedule periodic cleanup
setInterval(cleanupJobs, 6 * 60 * 60 * 1000); // Every 6 hours

module.exports = {
  createExtractionJob,
  createTestConnectionJob,
  createAnalysisJob,
  getQueueStats,
  cancelJob,
  cleanupJobs,
  extractionQueue,
  analysisQueue
};