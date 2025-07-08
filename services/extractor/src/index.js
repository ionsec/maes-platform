const Queue = require('bull');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('./logger');
require('dotenv').config();

// Initialize Redis queue
const extractionQueue = new Queue('extraction-jobs', process.env.REDIS_URL);

// PowerShell script paths
const EXTRACTOR_SUITE_PATH = '/extractor-suite';
const OUTPUT_PATH = '/output';

// Process extraction jobs
extractionQueue.process('extract-data', async (job) => {
  const { extractionId, type, parameters, credentials } = job.data;
  
  logger.info(`Starting extraction job ${extractionId} of type ${type}`);
  
  try {
    // Update job progress
    await job.progress(10);
    
    // Prepare PowerShell command based on extraction type
    const psCommand = buildPowerShellCommand(type, parameters, credentials);
    
    // Execute PowerShell script
    const result = await executePowerShell(psCommand, job);
    
    // Parse and store results
    const outputFiles = await processOutput(extractionId, type);
    
    logger.info(`Extraction job ${extractionId} completed successfully`);
    
    return {
      success: true,
      extractionId,
      outputFiles,
      statistics: result.statistics
    };
    
  } catch (error) {
    logger.error(`Extraction job ${extractionId} failed:`, error);
    throw error;
  }
});

// Build PowerShell command based on extraction type
function buildPowerShellCommand(type, parameters, credentials) {
  const baseCommand = `Import-Module '${EXTRACTOR_SUITE_PATH}/Microsoft-Extractor-Suite.psd1';`;
  
  let command = baseCommand;
  
  // Add unattended authentication using native Exchange Online commands
  if (credentials.certificateThumbprint) {
    // Certificate-based authentication
    command += `Connect-ExchangeOnline -AppId '${credentials.applicationId}' -CertificateThumbprint '${credentials.certificateThumbprint}' -Organization '${parameters.tenantId}';`;
  } else if (credentials.clientSecret) {
    // Client secret authentication - create secure string
    const secureSecret = `ConvertTo-SecureString -String '${credentials.clientSecret}' -AsPlainText -Force`;
    command += `$SecureSecret = ${secureSecret}; Connect-ExchangeOnline -AppId '${credentials.applicationId}' -ClientSecretCredential (New-Object System.Management.Automation.PSCredential('${credentials.applicationId}', $SecureSecret)) -Organization '${parameters.tenantId}';`;
  } else {
    throw new Error('Missing authentication credentials. Either certificateThumbprint or clientSecret is required for unattended extraction.');
  }
  
  // Add extraction command based on type
  const extractionCommands = {
    'unified_audit_log': `Get-UAL -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'azure_signin_logs': `Get-AzureADSignInLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'azure_audit_logs': `Get-AzureADAuditLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'mfa_status': `Get-MFAStatus -OutputDir '${OUTPUT_PATH}'`,
    'oauth_permissions': `Get-OAuthPermissions -OutputDir '${OUTPUT_PATH}'`,
    'risky_users': `Get-RiskyUsers -OutputDir '${OUTPUT_PATH}'`,
    'risky_detections': `Get-RiskyDetections -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'mailbox_audit': `Get-MailboxAuditLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'message_trace': `Get-MessageTraceLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'devices': `Get-Devices -OutputDir '${OUTPUT_PATH}'`,
    'full_extraction': `Start-EvidenceCollection -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`
  };
  
  command += extractionCommands[type] || '';
  
  return command;
}

// Execute PowerShell command
async function executePowerShell(command, job) {
  return new Promise((resolve, reject) => {
    const ps = spawn('pwsh', ['-Command', command]);
    
    let stdout = '';
    let stderr = '';
    
    ps.stdout.on('data', (data) => {
      stdout += data.toString();
      logger.debug(`PowerShell output: ${data.toString()}`);
      
      // Update progress based on output
      const progressMatch = data.toString().match(/Progress: (\d+)%/);
      if (progressMatch) {
        job.progress(parseInt(progressMatch[1]));
      }
    });
    
    ps.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.error(`PowerShell error: ${data.toString()}`);
    });
    
    ps.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
      } else {
        resolve({ stdout, stderr, statistics: parseStatistics(stdout) });
      }
    });
    
    ps.on('error', (error) => {
      reject(error);
    });
  });
}

// Parse statistics from PowerShell output
function parseStatistics(output) {
  const statistics = {
    totalEvents: 0,
    uniqueUsers: 0,
    uniqueOperations: 0
  };
  
  // Parse statistics from output
  const totalMatch = output.match(/Total Events: (\d+)/);
  if (totalMatch) statistics.totalEvents = parseInt(totalMatch[1]);
  
  const usersMatch = output.match(/Unique Users: (\d+)/);
  if (usersMatch) statistics.uniqueUsers = parseInt(usersMatch[1]);
  
  const opsMatch = output.match(/Unique Operations: (\d+)/);
  if (opsMatch) statistics.uniqueOperations = parseInt(opsMatch[1]);
  
  return statistics;
}

// Process output files
async function processOutput(extractionId, type) {
  const outputFiles = [];
  
  try {
    const files = await fs.readdir(OUTPUT_PATH);
    
    for (const file of files) {
      if (file.includes(type) || file.includes('Combined')) {
        const filePath = path.join(OUTPUT_PATH, file);
        const stats = await fs.stat(filePath);
        
        outputFiles.push({
          filename: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime
        });
        
        // Move file to extraction-specific directory
        const extractionDir = path.join(OUTPUT_PATH, extractionId);
        await fs.mkdir(extractionDir, { recursive: true });
        await fs.rename(filePath, path.join(extractionDir, file));
      }
    }
  } catch (error) {
    logger.error('Error processing output files:', error);
  }
  
  return outputFiles;
}

// Queue event handlers
extractionQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed:`, result);
});

extractionQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err);
});

extractionQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queue...');
  await extractionQueue.close();
  process.exit(0);
});

logger.info('Extractor service started and listening for jobs');