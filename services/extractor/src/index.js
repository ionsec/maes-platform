const { Worker, Queue } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { logger, createExtractionLogger } = require('./logger');
const { updateExtractionProgress } = require('./progressMonitor');
const axios = require('axios');
require('dotenv').config();

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD
};

// Initialize Redis queues with BullMQ
const extractionQueue = new Queue('extraction-jobs', {
  connection: redisConnection
});

// Analysis queue for triggering analyzer service
const analysisQueue = new Queue('analysis-jobs', {
  connection: redisConnection
});

// PowerShell script paths
const EXTRACTOR_SUITE_PATH = '/extractor-suite';
const OUTPUT_PATH = '/output';

// Process extraction jobs with proper error handling
const processExtractionJob = async (job) => {
  const { extractionId, type, parameters, credentials } = job.data;
  
  // Create extraction-specific logger
  const extractionLogger = createExtractionLogger(extractionId);
  
  logger.info(`Starting extraction job ${extractionId} of type ${type}`);
  extractionLogger.info(`Starting extraction job of type ${type}`);
  
  let progressMonitor = null;
  
  try {
    // Update job progress
    await job.updateProgress(10);
    
    // Start monitoring LogFile.txt for progress updates
    progressMonitor = updateExtractionProgress(extractionId, job);
    
    // Prepare PowerShell command based on extraction type
    const psCommand = buildPowerShellCommand(type, parameters, credentials);
    
    // Log the command for debugging (sanitize sensitive data)
    const sanitizedCommand = psCommand.replace(/ConvertTo-SecureString\s+'[^']+'/g, 'ConvertTo-SecureString ***');
    logger.debug(`Executing PowerShell command for extraction ${extractionId}: ${sanitizedCommand.substring(0, 500)}...`);
    extractionLogger.info('Connecting to Microsoft 365...');
    
    // Execute PowerShell script
    const result = await executePowerShell(psCommand, job, extractionLogger);
    
    // Stop progress monitoring
    if (progressMonitor && progressMonitor.stop) {
      progressMonitor.stop();
    }
    
    // Parse and store results
    const outputFiles = await processOutput(extractionId, type);
    
    logger.info(`Extraction job ${extractionId} completed successfully`);
    extractionLogger.info('Extraction completed successfully');
    
    // Log completion statistics
    extractionLogger.info(`Job ${extractionId} completed successfully:`);
    extractionLogger.success(`Total Events: ${result.statistics.totalEvents || 0}`);
    extractionLogger.success(`Unique Users: ${result.statistics.uniqueUsers || 0}`);
    extractionLogger.success(`Unique Operations: ${result.statistics.uniqueOperations || 0}`);
    extractionLogger.success(`Output Files: ${outputFiles.length}`);
    
    // Log output files details
    if (outputFiles.length > 0) {
      extractionLogger.info('Generated output files:');
      outputFiles.forEach(file => {
        extractionLogger.info(`  - ${file.filename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      });
    }
    
    // Trigger analysis for the extracted data
    try {
      await triggerAnalysis(extractionId, type, job.data.organizationId, outputFiles);
    } catch (analysisError) {
      logger.error(`Failed to trigger analysis for extraction ${extractionId}:`, analysisError);
      // Don't fail the extraction job if analysis trigger fails
    }
    
    // Set progress to 100% before completing
    await job.updateProgress(100);
    
    // Update extraction status to completed via API
    try {
      await updateExtractionStatus(extractionId, 'completed', {
        outputFiles,
        statistics: result.statistics,
        completedAt: new Date(),
        progress: 100
      });
    } catch (updateError) {
      logger.error(`Failed to update extraction status for ${extractionId}:`, updateError);
    }
    
    return {
      success: true,
      extractionId,
      outputFiles,
      statistics: result.statistics
    };
    
  } catch (error) {
    logger.error(`Extraction job ${extractionId} failed:`, error);
    extractionLogger.error(`Extraction failed: ${error.message}`);
    
    // Stop progress monitoring on error
    if (progressMonitor && progressMonitor.stop) {
      progressMonitor.stop();
    }
    
    throw error;
  }
};

// Process connection test jobs with proper error handling
const processTestConnectionJob = async (job) => {
  const { testId, parameters } = job.data;
  
  logger.info(`Starting connection test ${testId}`);
  
  try {
    // Update job progress
    await job.updateProgress(50);
    
    // Build test connection command
    const testCommand = buildTestConnectionCommand(parameters);
    
    // Execute PowerShell test
    const result = await executePowerShell(testCommand, job);
    
    logger.info(`Connection test ${testId} completed successfully`);
    
    // Extract UAL status from output
    let ualStatus = 'unknown';
    if (result.stdout.includes('UAL_STATUS:TRUE')) {
      ualStatus = 'enabled';
    } else if (result.stdout.includes('UAL_STATUS:FALSE')) {
      ualStatus = 'disabled';
    } else if (result.stdout.includes('UAL_STATUS:ERROR')) {
      ualStatus = 'error';
    }
    
    return {
      success: true,
      testId,
      result: result.stdout,
      connectionStatus: result.stdout.includes('CONNECTION_SUCCESS') ? 'success' : 'failed',
      ualStatus
    };
    
  } catch (error) {
    logger.error(`Connection test ${testId} failed:`, error);
    throw error;
  }
};

// Create worker for extraction jobs
const extractionWorker = new Worker('extraction-jobs', async (job) => {
  // Handle different job types
  if (job.name === 'extract-data') {
    return await processExtractionJob(job);
  } else if (job.name === 'test-connection') {
    return await processTestConnectionJob(job);
  }
}, { connection: redisConnection });

// Build PowerShell command based on extraction type
function buildPowerShellCommand(type, parameters, credentials) {
  const baseCommand = `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading Microsoft-Extractor-Suite module...";
    Import-Module Microsoft-Extractor-Suite -Force;
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Module loaded successfully";
  `;
  
  let command = baseCommand;
  
  // Always use certificate file authentication (PFX) - thumbprint is optional
  if (credentials.applicationId) {
    // Certificate-based authentication with PFX file - cross-platform-safe certificate loading
    const mountedCertPath = '/certs/app.pfx';
    const fallbackCertPath = '/output/app.pfx';
    const certPath = credentials.certificateFilePath || mountedCertPath;
    const certPassword = credentials.certificatePassword || 'Password123';
    command += `
      Write-Host 'Connecting to Microsoft 365 using certificate file...';
      try {
        # Path to PFX file
        if (Test-Path '${certPath}') { 
          $pfxPath = '${certPath}';
          Write-Host 'Using mounted certificate: ${certPath}';
        } else { 
          $pfxPath = '${fallbackCertPath}';
          Write-Host 'Using fallback certificate: ${fallbackCertPath}';
        }
        
        # Ensure the file exists
        if (-not (Test-Path $pfxPath)) {
          throw "PFX file not found at: $pfxPath";
        }
        
        # PFX password
        $securePwd = ConvertTo-SecureString '${certPassword}' -AsPlainText -Force;
        
        # Load the certificate (cross-platform-safe overload)
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
          $pfxPath,
          $securePwd,
          [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
        );
        
        # Output the thumbprint
        Write-Output ("Certificate: {0}" -f $cert.Thumbprint);
        
        # Connect to Exchange Online (Connect-M365) using that cert
        Write-Host "Executing Connect-M365 with AppId: ${credentials.applicationId}, Organization: ${parameters.fqdn || parameters.organization}";
        Connect-M365 -AppId '${credentials.applicationId}' -Organization '${parameters.fqdn || parameters.organization}' -Certificate $cert -ErrorAction Stop;
        Write-Host 'Connect-M365 completed successfully';
        
        # Verify Exchange Online connection
        Write-Host "Verifying Exchange Online connection...";
        $sessions = Get-PSSession;
        if ($sessions) {
          Write-Host "Active sessions found: $($sessions.Count)";
          $sessions | ForEach-Object { Write-Host "- Session: $($_.Name), State: $($_.State), ConfigurationName: $($_.ConfigurationName)" };
        } else {
          Write-Host "No active sessions found";
        }
        
        # Test if Search-UnifiedAuditLog is available
        try {
          $ual = Get-Command Search-UnifiedAuditLog -ErrorAction Stop;
          Write-Host "Search-UnifiedAuditLog cmdlet is available";
        } catch {
          Write-Error "Search-UnifiedAuditLog cmdlet NOT available - Exchange Online connection may have failed";
          Write-Error "Error: $_";
        }
      } catch {
        Write-Error "Connect-M365 failed: $_";
        exit 1;
      }
    `;
  } else {
    throw new Error('Missing authentication credentials. ApplicationId is required for authentication.');
  }
  
  // Add UAL validation after authentication for relevant extraction types
  const ualDependentTypes = ['unified_audit_log', 'full_extraction'];
  if (ualDependentTypes.includes(type)) {
    command += `
      Write-Host 'Checking Unified Audit Log availability...';
      try {
        $AuditConfig = Get-AdminAuditLogConfig -ErrorAction Stop;
        $UalEnabled = $AuditConfig.UnifiedAuditLogIngestionEnabled;
        if ($UalEnabled -eq $true) {
          Write-Host 'UAL_STATUS:ENABLED - Unified Audit Log is available';
        } else {
          Write-Host 'UAL_STATUS:DISABLED - Unified Audit Log is not enabled for this organization';
          Write-Error 'Unified Audit Log is not enabled. Please enable auditing in the Microsoft 365 compliance center.';
          exit 1;
        }
      } catch {
        Write-Host 'UAL_STATUS:ERROR - Unable to check Unified Audit Log status';
        Write-Warning "Could not verify UAL status: $_";
      }
    `;
  }
  
  // Add extraction command based on type
  const extractionCommands = {
    'unified_audit_log': `
      Write-Host "Starting Unified Audit Log extraction...";
      Write-Host "Parameters: StartDate='${parameters.startDate}', EndDate='${parameters.endDate}'";
      try {
        Get-UAL -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}';
        Write-Host "UAL extraction completed successfully.";
      } catch {
        Write-Error "UAL extraction failed: $_";
        throw;
      }
    `,
    'azure_signin_logs': `Get-AzureADSignInLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'azure_audit_logs': `Get-AzureADAuditLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'mfa_status': `Get-MFAStatus -OutputDir '${OUTPUT_PATH}'`,
    'oauth_permissions': `Get-OAuthPermissions -OutputDir '${OUTPUT_PATH}'`,
    'risky_users': `Get-RiskyUsers -OutputDir '${OUTPUT_PATH}'`,
    'risky_detections': `Get-RiskyDetections -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'mailbox_audit': `Get-MailboxAuditLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'message_trace': `Get-MessageTraceLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${OUTPUT_PATH}'`,
    'devices': `Get-Devices -OutputDir '${OUTPUT_PATH}'`,
    'full_extraction': `Start-EvidenceCollection -ProjectName 'MAES-Extraction' -OutputDir '${OUTPUT_PATH}'`
  };
  
  command += extractionCommands[type] || '';
  
  return command;
}

// Build PowerShell command for connection testing
function buildTestConnectionCommand(parameters) {
  const baseCommand = `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading Microsoft-Extractor-Suite module...";
    Import-Module Microsoft-Extractor-Suite -Force;
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Module loaded successfully";
  `;
  
  let command = baseCommand;
  
  // Always use certificate-based authentication for connection testing
  if (parameters.applicationId) {
    const certPath = '/certs/app.pfx';
    const fallbackCertPath = '/output/app.pfx';
    const certPassword = 'Password123';
    command += `try {
      Write-Host 'Testing connection with certificate file...';
      $CertPwd = ConvertTo-SecureString -String '${certPassword}' -AsPlainText -Force;
      if (Test-Path '${certPath}') { 
        $CertToUse = '${certPath}';
        Write-Host 'Using mounted certificate: ${certPath}';
      } else { 
        $CertToUse = '${fallbackCertPath}';
        Write-Host 'Using fallback certificate: ${fallbackCertPath}';
      }
      # Ensure the file exists
      if (-not (Test-Path $CertToUse)) {
        throw "PFX file not found at: $CertToUse";
      }
      
      # PFX password
      $securePwd = ConvertTo-SecureString '${certPassword}' -AsPlainText -Force;
      
      # Load the certificate (cross-platform-safe overload)
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $CertToUse,
        $securePwd,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
      );
      
      # Output the thumbprint
      Write-Output ("Certificate: {0}" -f $cert.Thumbprint);
      
      # Connect to Exchange Online (Connect-M365) using that cert
      Connect-M365 -AppId '${parameters.applicationId}' -Organization '${parameters.fqdn}' -Certificate $cert -ErrorAction Stop; 
      Write-Host 'Connect-M365 completed successfully';
      Write-Host 'CONNECTION_SUCCESS';
      Connect-MgGraph -ClientId '${parameters.applicationId}' -CertificateThumbprint $cert.Thumbprint -TenantId '${parameters.fqdn}' -ErrorAction Stop; 
      try { $AuditConfig = Get-AdminAuditLogConfig -ErrorAction Stop; $UalEnabled = $AuditConfig.UnifiedAuditLogIngestionEnabled; Write-Host \"UAL_STATUS:$($UalEnabled.ToString().ToUpper())\" } catch { Write-Host 'UAL_STATUS:ERROR' }; 
      Disconnect-ExchangeOnline -Confirm:$false; Disconnect-MgGraph 
    } catch { Write-Host "CONNECTION_ERROR: $_" }`;
  }
  
  return command;
}

// Execute PowerShell command with timeout and better error handling
async function executePowerShell(command, job, extractionLogger) {
  return new Promise((resolve, reject) => {
    // Set timeout to prevent hanging jobs - configurable via environment variable
    const timeoutMs = parseInt(process.env.POWERShell_TIMEOUT) || 30 * 60 * 1000; // Default 30 minutes
    const timeout = setTimeout(() => {
      logger.warn(`PowerShell command timed out after ${timeoutMs / 1000 / 60} minutes, killing process...`);
      ps.kill('SIGKILL');
      reject(new Error(`PowerShell command timed out after ${timeoutMs / 1000 / 60} minutes`));
    }, timeoutMs);

    const ps = spawn('pwsh', ['-Command', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs
    });
    
    let stdout = '';
    let stderr = '';
    
    ps.stdout.on('data', (data) => {
      stdout += data.toString();
      const output = data.toString();
      logger.info(`PowerShell output: ${output}`);
      
      // Log to extraction-specific logger if available
      if (extractionLogger) {
        // Parse and clean up PowerShell output for extraction logs
        const lines = output.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          // Skip banner lines
          if (line.includes('+-+-+-+-+-+-+-+-+-+') || 
              line.includes('|M|i|c|r|o|s|o|f|t|') ||
              line.includes('Copyright') ||
              line.includes('Created by')) {
            return;
          }
          
          // Log meaningful messages
          if (line.includes('Loading Microsoft-Extractor-Suite module')) {
            extractionLogger.info('Loading Microsoft Extractor Suite module...');
          } else if (line.includes('Module loaded successfully')) {
            extractionLogger.info('Module loaded successfully');
          } else if (line.includes('Connecting to Microsoft 365')) {
            extractionLogger.info('Connecting to Microsoft 365...');
          } else if (line.includes('Using mounted certificate')) {
            extractionLogger.info('Using certificate authentication');
          } else if (line.includes('Certificate:')) {
            extractionLogger.info(`Certificate thumbprint: ${line.split('Certificate:')[1].trim()}`);
          } else if (line.includes('Connect-M365 completed successfully')) {
            extractionLogger.info('Successfully connected to Microsoft 365');
          } else if (line.includes('UAL_STATUS:ENABLED')) {
            extractionLogger.info('✓ Unified Audit Log is enabled');
          } else if (line.includes('UAL_STATUS:DISABLED')) {
            extractionLogger.warn('⚠ Unified Audit Log is disabled - extraction may fail');
          } else if (line.includes('Starting Unified Audit Log extraction')) {
            extractionLogger.info('Starting Unified Audit Log extraction...');
          } else if (line.includes('UAL extraction completed successfully')) {
            extractionLogger.info('UAL extraction completed successfully');
          } else if (line.includes('Get-UAL')) {
            extractionLogger.info('Executing UAL extraction command...');
          } else if (line.includes('Verifying Exchange Online connection')) {
            extractionLogger.info('Verifying Exchange Online connection...');
          } else if (line.includes('Active sessions found')) {
            extractionLogger.info('Exchange Online session established');
          } else if (line.includes('Search-UnifiedAuditLog cmdlet is available')) {
            extractionLogger.info('Unified Audit Log cmdlet verified');
          }
        });
      }
      
      // Update progress based on output
      const progressMatch = output.match(/Progress: (\d+)%/);
      if (progressMatch) {
        job.updateProgress(parseInt(progressMatch[1]));
      }
    });
    
    ps.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.error(`PowerShell error: ${data.toString()}`);
      
      // Log errors to extraction-specific logger if available
      if (extractionLogger) {
        const errorMessage = data.toString().trim();
        if (errorMessage) {
          // Parse specific error types
          if (errorMessage.includes('isn\'t supported in this scenario')) {
            extractionLogger.error('Authentication failed: Missing required Exchange Online permissions');
            extractionLogger.error('Please ensure the Azure AD application has the "Exchange.ManageAsApp" permission');
          } else if (errorMessage.includes('AADSTS700016') || errorMessage.includes('Application with identifier')) {
            extractionLogger.error('Authentication failed: Invalid Azure AD Application ID');
            extractionLogger.error('Please verify the App ID and ensure proper permissions are granted');
          } else if (errorMessage.includes('Organization') && errorMessage.includes('not found')) {
            extractionLogger.error('Authentication failed: Organization not found');
            extractionLogger.error('Please use the FQDN (e.g., contoso.onmicrosoft.com) instead of Tenant ID');
          } else if (errorMessage.includes('certificate') && (errorMessage.includes('not found') || errorMessage.includes('invalid'))) {
            extractionLogger.error('Authentication failed: Certificate error');
            extractionLogger.error('Please verify the certificate file path and password');
          } else if (errorMessage.includes('Unified Audit Log is not enabled')) {
            extractionLogger.error('Extraction failed: Unified Audit Log is not enabled');
            extractionLogger.error('Please enable auditing in the Microsoft 365 compliance center');
          } else if (errorMessage.includes('Write-Error')) {
            // Extract the actual error message from Write-Error
            const errorMatch = errorMessage.match(/Write-Error:.*?([^[]+)/);;
            if (errorMatch) {
              extractionLogger.error(errorMatch[1].trim());
            } else {
              extractionLogger.error(errorMessage);
            }
          } else {
            extractionLogger.error(errorMessage);
          }
        }
      }
      
      // Check for common errors
      if (stderr.includes('AADSTS700016') || stderr.includes('Application with identifier')) {
        logger.error('Error: Invalid Azure AD Application ID or permissions. Please verify the App ID and ensure proper permissions are granted.');
      }
      
      if (stderr.includes('Organization') && stderr.includes('not found')) {
        logger.error('Error: Organization not found. Please use the FQDN (e.g., contoso.onmicrosoft.com) instead of Tenant ID for the -Organization parameter.');
      }
      
      if (stderr.includes('certificate') && (stderr.includes('not found') || stderr.includes('invalid'))) {
        logger.error('Error: Certificate authentication failed. Please verify the certificate file path, thumbprint, and password.');
      }
    });
    
    ps.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        let errorMessage = `PowerShell exited with code ${code}: ${stderr}`;
        
        // Provide more specific error messages
        if (stderr.includes('Organization') && stderr.includes('not found')) {
          errorMessage = 'Organization not found. Please ensure you are using the FQDN (e.g., yourcompany.onmicrosoft.com) and not the Tenant ID (GUID) for the Organization parameter.';
        } else if (stderr.includes('AADSTS700016')) {
          errorMessage = 'Azure AD authentication failed. Please verify your App ID and ensure the application has the required permissions (Exchange.ManageAsApp).';
        } else if (stderr.includes('certificate')) {
          errorMessage = 'Certificate authentication failed. Please check the certificate file path, password, and ensure it is properly configured in Azure AD.';
        } else if (stderr.includes('Connect-M365') && stderr.includes('parameter')) {
          errorMessage = 'Connect-M365 parameter error. Please verify the authentication parameters are correct.';
        }
        
        reject(new Error(errorMessage));
      } else {
        resolve({ stdout, stderr, statistics: parseStatistics(stdout) });
      }
    });
    
    ps.on('error', (error) => {
      clearTimeout(timeout);
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
  const totalMatch = output.match(/Total number of events during the acquisition period: (\d+)/);
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
    logger.info(`Processing output for extraction ${extractionId}, type: ${type}`);
    logger.info(`Found files in output directory: ${files.join(', ')}`);
    
    for (const file of files) {
      // Check if file matches extraction type or is a data file
      const isDataFile = file.includes(type) || 
                        file.includes('Combined') ||
                        file.includes('UAL-') || // Unified Audit Log files
                        file.includes('AzureAD') ||
                        file.includes('Exchange') ||
                        file.includes('SharePoint') ||
                        file.includes('Teams') ||
                        file.endsWith('.csv') ||
                        file.endsWith('.json');
      
      // Skip certificate files
      const isCertFile = file.endsWith('.pfx') || file.endsWith('.crt') || file.endsWith('.key');
      
      if (isDataFile && !isCertFile) {
        const filePath = path.join(OUTPUT_PATH, file);
        const stats = await fs.stat(filePath);
        
        logger.info(`Processing data file: ${file} (size: ${stats.size} bytes)`);
        
        // Move file to extraction-specific directory first
        const extractionDir = path.join(OUTPUT_PATH, extractionId);
        await fs.mkdir(extractionDir, { recursive: true });
        const newPath = path.join(extractionDir, file);
        await fs.rename(filePath, newPath);
        logger.info(`Moved ${file} to ${newPath}`);
        
        // Add to output files with correct path
        outputFiles.push({
          filename: file,
          path: newPath,
          size: stats.size,
          createdAt: stats.birthtime
        });
      }
    }
  } catch (error) {
    logger.error('Error processing output files:', error);
  }
  
  return outputFiles;
}

// Worker event handlers with better error handling
extractionWorker.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed successfully:`, result);
});

extractionWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, err);
  
  // If job has exceeded max attempts, mark it as permanently failed
  if (job.attemptsMade >= job.opts.attempts) {
    logger.error(`Job ${job.id} permanently failed after ${job.attemptsMade} attempts`);
  }
});

extractionWorker.on('stalled', (jobId) => {
  logger.warn(`Job ${jobId} stalled, will be retried`);
});

extractionWorker.on('error', (error) => {
  logger.error('Worker error:', error);
});

// Queue event handlers
extractionQueue.on('waiting', (jobId) => {
  logger.info(`Job ${jobId} waiting to be processed`);
});

extractionQueue.on('active', (job) => {
  logger.info(`Job ${job.id} started processing`);
});

// Graceful shutdown with proper cleanup
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker and queue...');
  try {
    await extractionWorker.close();
    await extractionQueue.close();
    logger.info('Worker and queue closed successfully');
  } catch (error) {
    logger.error('Error closing worker and queue:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker and queue...');
  try {
    await extractionWorker.close();
    await extractionQueue.close();
    logger.info('Worker and queue closed successfully');
  } catch (error) {
    logger.error('Error closing worker and queue:', error);
  }
  process.exit(0);
});

// Health check function to monitor queue status
async function healthCheck() {
  try {
    const counts = await extractionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    
    logger.info(`Queue health check - Waiting: ${counts.waiting || 0}, Active: ${counts.active || 0}, Completed: ${counts.completed || 0}, Failed: ${counts.failed || 0}, Delayed: ${counts.delayed || 0}`);
    
    // Get details of active jobs if any
    if (counts.active > 0) {
      const active = await extractionQueue.getJobs(['active']);
      logger.info(`Active jobs: ${active.map(job => `${job.id} (${job.data.extractionId || job.data.testId})`).join(', ')}`);
    }
    
    // Get details of failed jobs if any
    if (counts.failed > 0) {
      const failed = await extractionQueue.getJobs(['failed']);
      logger.warn(`Failed jobs: ${failed.map(job => `${job.id} (${job.data.extractionId || job.data.testId})`).join(', ')}`);
    }
    
  } catch (error) {
    logger.error('Health check failed:', error);
  }
}

// Clean up stalled jobs function
async function cleanupStalledJobs() {
  try {
    // Get failed and active jobs using BullMQ's getJobs method
    const failed = await extractionQueue.getJobs(['failed']);
    const active = await extractionQueue.getJobs(['active']);
    
    if (failed.length > 0) {
      logger.warn(`Found ${failed.length} failed jobs, cleaning up old ones...`);
      
      // Clean up failed jobs older than 1 hour
      const oneHourAgo = Date.now() - 3600000;
      for (const job of failed) {
        try {
          if (job.timestamp < oneHourAgo) {
            await job.remove();
            logger.info(`Removed old failed job ${job.id}`);
          }
        } catch (error) {
          logger.error(`Failed to remove old failed job ${job.id}:`, error);
        }
      }
    }
    
    // Check for jobs that have been active too long (potential stalls)
    if (active.length > 0) {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      for (const job of active) {
        try {
          if (job.timestamp < thirtyMinutesAgo) {
            logger.warn(`Job ${job.id} has been active for over 30 minutes, marking as failed`);
            await job.moveToFailed(new Error('Job timed out after 30 minutes'), '0');
          }
        } catch (error) {
          logger.error(`Failed to handle long-running job ${job.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('Cleanup stalled jobs failed:', error);
  }
}

// Run cleanup every 2 minutes
setInterval(cleanupStalledJobs, 2 * 60 * 1000);

// Run health check every 5 minutes
setInterval(healthCheck, 5 * 60 * 1000);

// Helper function to trigger analysis after extraction
async function triggerAnalysis(extractionId, extractionType, organizationId, outputFiles) {
  try {
    // Map extraction types to analysis types
    const analysisTypeMap = {
      'unified_audit_log': 'ual_analysis',
      'azure_signin_logs': 'signin_analysis',
      'azure_audit_logs': 'audit_analysis',
      'full_extraction': 'comprehensive_analysis'
    };
    
    const analysisType = analysisTypeMap[extractionType] || 'ual_analysis';
    
    logger.info(`Triggering ${analysisType} analysis for extraction ${extractionId}`);
    
    // Create analysis job via API to ensure proper database record creation
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    
    if (!serviceToken) {
      throw new Error('SERVICE_AUTH_TOKEN environment variable is not set');
    }
    
    try {
      const response = await axios.post(
        `${apiUrl}/api/analysis/internal`,
        {
          extractionId,
          type: analysisType,
          priority: 'medium',
          parameters: {
            extractionType,
            outputFiles,
            autoTriggered: true,
            enableThreatIntel: true,
            enablePatternDetection: true,
            enableAnomalyDetection: false
          }
        },
        {
          headers: {
            'x-service-token': serviceToken,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      if (response.data && response.data.success) {
        logger.info(`Analysis job ${response.data.analysisJob.id} created for extraction ${extractionId} via API`);
      } else {
        throw new Error('API response indicated failure');
      }
      
    } catch (apiError) {
      logger.error('Failed to create analysis job via API, falling back to direct queue method:', {
        error: apiError.message,
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        url: `${apiUrl}/api/analysis/internal`
      });
      
      // Fallback to direct queue method - but also try to create database record
      const analysisId = crypto.randomUUID();
      
      try {
        // Try to create database record directly
        const axios = require('axios');
        const dbResponse = await axios.post(
          `${apiUrl}/api/analysis/internal/direct`,
          {
            id: analysisId,
            extractionId,
            organizationId: organizationId || '00000000-0000-0000-0000-000000000001',
            type: analysisType,
            priority: 'medium',
            parameters: {
              extractionType,
              outputFiles,
              autoTriggered: true
            }
          },
          {
            headers: {
              'x-service-token': process.env.SERVICE_AUTH_TOKEN,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        
        if (dbResponse.data && dbResponse.data.success) {
          logger.info(`Database record created for fallback analysis job ${analysisId}`);
        }
      } catch (dbError) {
        logger.warn('Failed to create database record for fallback analysis job:', dbError.message);
      }
      
      // Add to queue regardless of database record creation
      const analysisJob = await analysisQueue.add('analyze-data', {
        analysisId,
        extractionId,
        organizationId: organizationId || '00000000-0000-0000-0000-000000000001',
        analysisType,
        type: analysisType,
        parameters: {
          extractionType,
          outputFiles,
          autoTriggered: true
        }
      });
      
      logger.info(`Analysis job ${analysisJob.id} created for extraction ${extractionId} via fallback method`);
    }
    
  } catch (error) {
    logger.error('Error triggering analysis:', error);
    throw error;
  }
}

// Helper function to update extraction status via API
async function updateExtractionStatus(extractionId, status, metadata = {}) {
  try {
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const response = await axios.patch(
      `${apiUrl}/api/extractions/${extractionId}/status`,
      {
        status,
        ...metadata
      },
      {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    if (response.data.success) {
      logger.info(`Extraction ${extractionId} status updated to ${status}`);
    }
    
  } catch (error) {
    logger.error(`Failed to update extraction status via API:`, error.message);
    throw error;
  }
}

logger.info('Extractor service started and listening for jobs');