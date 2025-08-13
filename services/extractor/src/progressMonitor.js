const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const Redis = require('ioredis');

const LOG_FILE_PATH = '/output/LogFile.txt';
const OUTPUT_PATH = '/output';

// Redis client for logging
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD
});

// Helper function to log to Redis
async function logToRedis(extractionId, level, message) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message
    };
    const key = `extraction:logs:${extractionId}`;
    await redisClient.rpush(key, JSON.stringify(logEntry));
    await redisClient.expire(key, 86400); // 24 hours TTL
  } catch (error) {
    logger.error('Failed to log to Redis:', error);
  }
}

// Monitor LogFile.txt for extraction progress
function updateExtractionProgress(extractionId, job) {
  let watcher = null;
  let lastPosition = 0;
  let currentProgress = 10; // Start at 10% as set in main process
  let isMonitoring = false;

  const progressPatterns = [
    // Common progress indicators in Microsoft Extractor Suite
    /Progress:\s*(\d+)%/i,
    /(\d+)%\s+complete/i,
    /Processing\s+(\d+)\s+of\s+(\d+)/i,
    /Extracted\s+(\d+)\/(\d+)/i,
    /Completed\s+(\d+)\s+out\s+of\s+(\d+)/i,
    /Records\s+processed:\s*(\d+)/i,
    /Items\s+retrieved:\s*(\d+)/i,
    /(\d+)\s+items\s+exported/i,
    /Export\s+completed/i,
    /Extraction\s+finished/i,
    /Collection\s+complete/i,
    // PowerShell output patterns
    /\[INFO\]\s+Total\s+number\s+of\s+events\s+during\s+the\s+acquisition\s+period:\s*(\d+)/i,
    /\[INFO\]\s+Using\s+interval\s+of\s+(\d+)\s+minutes/i,
    /\[INFO\]\s+Found\s+(\d+)\s+audit\s+logs/i,
    /Total\s+number\s+of\s+events:\s*(\d+)/i,
    /Found\s+(\d+)\s+events/i
  ];

  const statusPatterns = [
    { pattern: /Starting\s+.*extraction/i, progress: 15, status: 'Starting extraction' },
    { pattern: /Connecting\s+to\s+.*Exchange/i, progress: 20, status: 'Connecting to Exchange Online' },
    { pattern: /Connected\s+to\s+.*Exchange/i, progress: 25, status: 'Connected to Exchange Online' },
    { pattern: /Connecting\s+to\s+.*Azure/i, progress: 20, status: 'Connecting to Azure AD' },
    { pattern: /Connected\s+to\s+.*Azure/i, progress: 25, status: 'Connected to Azure AD' },
    { pattern: /Authenticating/i, progress: 15, status: 'Authenticating' },
    { pattern: /Authentication\s+successful/i, progress: 25, status: 'Authentication successful' },
    { pattern: /Checking\s+Unified\s+Audit\s+Log/i, progress: 27, status: 'Checking Unified Audit Log availability' },
    { pattern: /UAL_STATUS:ENABLED/i, progress: 28, status: 'Unified Audit Log is available' },
    { pattern: /UAL_STATUS:DISABLED/i, progress: 28, status: 'WARNING: Unified Audit Log is disabled' },
    { pattern: /UAL_STATUS:ERROR/i, progress: 28, status: 'Unable to verify Unified Audit Log status' },
    { pattern: /Getting\s+.*audit\s+logs/i, progress: 30, status: 'Retrieving audit logs' },
    { pattern: /Getting\s+.*mailbox/i, progress: 30, status: 'Retrieving mailbox data' },
    { pattern: /Getting\s+.*sign-?in\s+logs/i, progress: 30, status: 'Retrieving sign-in logs' },
    { pattern: /Getting\s+.*users/i, progress: 30, status: 'Retrieving user data' },
    { pattern: /Starting\s+export/i, progress: 40, status: 'Starting data export' },
    { pattern: /Exporting\s+to\s+CSV/i, progress: 50, status: 'Exporting to CSV' },
    { pattern: /Saving\s+.*file/i, progress: 70, status: 'Saving output files' },
    { pattern: /Export\s+completed/i, progress: 85, status: 'Export completed' },
    { pattern: /Extraction\s+complete/i, progress: 90, status: 'Extraction complete' },
    { pattern: /Disconnecting/i, progress: 95, status: 'Disconnecting from services' },
    // PowerShell status patterns
    { pattern: /\[INFO\]\s+Total\s+number\s+of\s+events\s+during\s+the\s+acquisition\s+period:\s*(\d+)/i, progress: 35, status: 'Calculating event distribution' },
    { pattern: /\[INFO\]\s+Using\s+interval\s+of\s+(\d+)\s+minutes/i, progress: 38, status: 'Setting extraction interval' },
    { pattern: /\[INFO\]\s+Found\s+(\d+)\s+audit\s+logs\s+between/i, progress: 45, status: 'Processing audit logs' },
    { pattern: /PowerShell\s+output:/i, progress: 32, status: 'Executing PowerShell commands' }
  ];

  const errorPatterns = [
    /Error:/i,
    /Exception:/i,
    /Failed\s+to/i,
    /Cannot\s+connect/i,
    /Authentication\s+failed/i,
    /Access\s+denied/i,
    /AADSTS\d+/i,
    /Unified\s+Audit\s+Log\s+is\s+not\s+enabled/i
  ];

  async function checkLogFile() {
    try {
      // Check if log file exists
      if (!fs.existsSync(LOG_FILE_PATH)) {
        return;
      }

      const stats = fs.statSync(LOG_FILE_PATH);
      
      // Only read new content since last check
      if (stats.size <= lastPosition) {
        return;
      }

      const stream = fs.createReadStream(LOG_FILE_PATH, {
        start: lastPosition,
        end: stats.size
      });

      let newContent = '';
      
      stream.on('data', (chunk) => {
        newContent += chunk.toString();
      });

      stream.on('end', async () => {
        lastPosition = stats.size;
        
        if (newContent.trim()) {
          await parseLogContent(newContent);
        }
      });

      stream.on('error', (error) => {
        logger.error('Error reading log file:', error);
      });

    } catch (error) {
      logger.error('Error checking log file:', error);
    }
  }

  async function parseLogContent(content) {
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Always log PowerShell output and [INFO] messages to Redis for real-time logs
      if (line.includes('PowerShell output:') || line.includes('[INFO]')) {
        await logToRedis(extractionId, 'info', line.trim());
      }

      // Check for UAL status updates first
      if (line.includes('UAL_STATUS:')) {
        const ualStatus = line.includes('UAL_STATUS:ENABLED') ? 'enabled' : 
                         line.includes('UAL_STATUS:DISABLED') ? 'disabled' : 'error';
        
        // Store UAL status in job data for API to retrieve
        job.data.ualStatus = ualStatus;
        logger.info(`Extraction ${extractionId} UAL status: ${ualStatus}`);
        
        if (ualStatus === 'disabled') {
          await updateProgress(currentProgress, 'error', 'Unified Audit Log is disabled for this organization');
          return;
        }
      }

      // Check for errors first
      for (const errorPattern of errorPatterns) {
        if (errorPattern.test(line)) {
          logger.error(`Extraction ${extractionId} error detected: ${line.trim()}`);
          await updateProgress(currentProgress, 'error', line.trim());
          return;
        }
      }

      // Check for specific status patterns
      for (const statusInfo of statusPatterns) {
        const match = line.match(statusInfo.pattern);
        if (match) {
          currentProgress = Math.max(currentProgress, statusInfo.progress);
          let statusMessage = statusInfo.status;
          
          // If the pattern captured a number, include it in the status
          if (match[1]) {
            statusMessage = `${statusInfo.status}: ${match[1]}`;
          }
          
          logger.info(`Extraction ${extractionId} status: ${statusMessage} (${currentProgress}%)`);
          await updateProgress(currentProgress, 'running', statusMessage);
          
          // Also log PowerShell [INFO] messages to Redis for real-time display
          if (line.includes('[INFO]') || line.includes('PowerShell output:')) {
            await logToRedis(extractionId, 'info', line.trim());
          }
          break;
        }
      }

      // Check for progress patterns
      for (const progressPattern of progressPatterns) {
        const match = line.match(progressPattern);
        if (match) {
          let detectedProgress = currentProgress;
          let progressMessage = line.trim();
          
          if (match[1] && match[2]) {
            // Format: "Processing X of Y" or "Extracted X/Y"
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            if (total > 0) {
              detectedProgress = Math.floor((current / total) * 60) + 30; // Map to 30-90% range
            }
          } else if (match[1]) {
            // Direct percentage or count
            const value = parseInt(match[1]);
            if (value <= 100) {
              detectedProgress = Math.max(30, value); // Ensure minimum 30%
            } else {
              // Large number (record count), increment gradually
              detectedProgress = Math.min(currentProgress + 5, 85);
              // For PowerShell [INFO] messages with counts
              if (line.includes('[INFO]')) {
                progressMessage = line.replace(/\[INFO\]\s*/i, '').trim();
              }
            }
          }
          
          if (detectedProgress > currentProgress) {
            currentProgress = Math.min(detectedProgress, 95); // Cap at 95%
            logger.info(`Extraction ${extractionId} progress: ${currentProgress}% - ${progressMessage}`);
            await updateProgress(currentProgress, 'running', progressMessage);
          }
          
          // Log PowerShell [INFO] messages to Redis
          if (line.includes('[INFO]')) {
            await logToRedis(extractionId, 'info', line.trim());
          }
          break;
        }
      }

      // Check for completion indicators and total count
      if (/export\s+completed|extraction\s+finished|collection\s+complete/i.test(line)) {
        currentProgress = 95;
        logger.info(`Extraction ${extractionId} near completion: ${line.trim()}`);
        await updateProgress(currentProgress, 'running', line.trim());
      }
      
      // Check for total items collected patterns
      const totalPatterns = [
        /Total\s+items\s+collected:\s*(\d+)/i,
        /Total\s+events\s+exported:\s*(\d+)/i,
        /Total\s+records\s+processed:\s*(\d+)/i,
        /(\d+)\s+items\s+have\s+been\s+extracted/i,
        /(\d+)\s+audit\s+logs\s+exported/i,
        /Exported\s+(\d+)\s+records/i,
        /Collection\s+complete.*?(\d+)\s+items/i
      ];
      
      for (const totalPattern of totalPatterns) {
        const match = line.match(totalPattern);
        if (match) {
          const totalItems = parseInt(match[1]);
          if (totalItems > 0) {
            logger.info(`Extraction ${extractionId} total items collected: ${totalItems}`);
            await updateProgress(currentProgress, 'running', `Total items collected: ${totalItems}`);
            
            // Store total count in job data for API to retrieve
            job.data.totalItemsCollected = totalItems;
            break;
          }
        }
      }
    }
  }

  async function updateProgress(progress, status, message) {
    try {
      // Update BullMQ job progress
      await job.updateProgress(progress);
      
      // Update database extraction record
      await updateExtractionRecord(extractionId, progress, status, message);
      
      // Log progress update
      logger.info(`Extraction ${extractionId} progress updated: ${progress}% - ${status} - ${message}`);
      
    } catch (error) {
      logger.error(`Failed to update progress for extraction ${extractionId}:`, error);
    }
  }

  async function updateExtractionRecord(extractionId, progress, status, message) {
    try {
      // This would normally connect to the database and update the extraction record
      // For now, we'll use the job data and let the API handle database updates
      const updateData = {
        progress,
        status,
        lastMessage: message,
        updatedAt: new Date().toISOString()
      };
      
      // Store progress data in job for API to retrieve
      job.data.progressUpdate = updateData;
      
    } catch (error) {
      logger.error('Failed to update extraction record:', error);
    }
  }

  function startMonitoring() {
    if (isMonitoring) return;
    
    isMonitoring = true;
    logger.info(`Starting progress monitoring for extraction ${extractionId}`);
    
    // Initial check
    checkLogFile();
    
    // Set up file watcher for the specific LogFile.txt
    try {
      // First, try to watch the specific file if it exists
      if (fs.existsSync(LOG_FILE_PATH)) {
        watcher = fs.watch(LOG_FILE_PATH, (eventType) => {
          if (eventType === 'change') {
            checkLogFile();
          }
        });
        logger.info('Successfully set up file watcher for LogFile.txt');
      } else {
        // If file doesn't exist yet, watch the directory without recursive option
        watcher = fs.watch(OUTPUT_PATH, (eventType, filename) => {
          if (filename === 'LogFile.txt' && eventType === 'change') {
            checkLogFile();
          }
        });
        logger.info('Successfully set up directory watcher for OUTPUT_PATH');
      }
    } catch (error) {
      logger.warn('Could not set up file watcher, falling back to polling:', error);
      watcher = null;
    }
    
    // Always set up periodic checking as backup
    const pollInterval = setInterval(() => {
      if (!isMonitoring) {
        clearInterval(pollInterval);
        return;
      }
      checkLogFile();
    }, 2000); // Check every 2 seconds
    
    // Store the interval so we can clear it later
    pollInterval.extractionId = extractionId;
    
    // Store the interval reference for cleanup
    pollInterval.monitorId = extractionId;
  }

  function stopMonitoring() {
    isMonitoring = false;
    
    if (watcher) {
      try {
        watcher.close();
      } catch (error) {
        logger.warn('Error closing file watcher:', error);
      }
      watcher = null;
    }
    
    // Clear any existing polling intervals
    // Find and clear intervals for this extraction
    const intervals = setInterval(() => {}, 0);
    if (intervals && intervals.monitorId === extractionId) {
      clearInterval(intervals);
    }
    
    logger.info(`Stopped progress monitoring for extraction ${extractionId}`);
  }

  // Start monitoring immediately
  startMonitoring();

  // Return control object
  return {
    stop: stopMonitoring,
    getCurrentProgress: () => currentProgress,
    isActive: () => isMonitoring
  };
}

module.exports = {
  updateExtractionProgress
};