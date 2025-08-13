const { Worker, Queue } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
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

// Helper function to create organization-scoped output path
const getOrganizationOutputPath = (organizationId, extractionId) => {
  // Sanitize organizationId to prevent path traversal
  const safeOrgId = (organizationId || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  return path.join(OUTPUT_PATH, 'orgs', safeOrgId, extractionId);
};

// Process extraction jobs with proper error handling
const processExtractionJob = async (job) => {
  const { extractionId, type, parameters, credentials, organizationId, organizationName } = job.data;
  
  // Create organization-scoped output directory
  const orgOutputPath = getOrganizationOutputPath(organizationId, extractionId);
  await fs.mkdir(orgOutputPath, { recursive: true });
  
  // Create extraction-specific logger
  const extractionLogger = createExtractionLogger(extractionId);
  
  logger.info(`Starting extraction job ${extractionId} of type ${type} for organization ${organizationName || organizationId || 'default'}`);
  extractionLogger.info(`Starting extraction job of type ${type} for organization: ${organizationName || organizationId || 'default'}`);
  
  let progressMonitor = null;
  
  try {
    // Update job progress
    await job.updateProgress(10);
    
    // Start monitoring LogFile.txt for progress updates
    progressMonitor = updateExtractionProgress(extractionId, job);
    
    // Prepare PowerShell command based on extraction type
    const psCommand = await buildPowerShellCommand(type, parameters, credentials, extractionId, orgOutputPath);
    
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
    const outputFiles = await processOutput(extractionId, type, organizationId);
    
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
    
    // Update extraction status to completed via API - critical for UI consistency
    try {
      logger.info(`Attempting to update extraction ${extractionId} status to 'completed'...`);
      await updateExtractionStatus(extractionId, organizationId, 'completed', {
        outputFiles,
        statistics: result.statistics,
        completedAt: new Date(),
        progress: 100
      });
      logger.info(`Successfully updated extraction ${extractionId} status to 'completed'`);
    } catch (updateError) {
      logger.error(`CRITICAL: Failed to update extraction status for ${extractionId}. UI may show incorrect status.`, {
        error: updateError.message,
        extractionId,
        outputFiles: outputFiles.length,
        statistics: result.statistics
      });
      // Don't throw here - the extraction was successful, just the status update failed
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
    
    // Update extraction status to failed via API
    try {
      logger.info(`Updating extraction ${extractionId} status to 'failed' due to error...`);
      await updateExtractionStatus(extractionId, organizationId, 'failed', {
        errorMessage: error.message,
        failedAt: new Date(),
        progress: job.progress || 0
      });
      logger.info(`Successfully updated extraction ${extractionId} status to 'failed'`);
    } catch (updateError) {
      logger.error(`CRITICAL: Failed to update extraction status to 'failed' for ${extractionId}. UI may show incorrect status.`, {
        originalError: error.message,
        updateError: updateError.message,
        extractionId
      });
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
    const testCommand = await buildTestConnectionCommand(parameters);
    
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
    
    // Extract Graph connection status
    let graphStatus = 'unknown';
    if (result.stdout.includes('GRAPH_CONNECTION_SUCCESS')) {
      graphStatus = 'success';
    } else if (result.stdout.includes('GRAPH_CONNECTION_ERROR')) {
      graphStatus = 'error';
    }
    
    return {
      success: true,
      testId,
      result: result.stdout,
      connectionStatus: result.stdout.includes('CONNECTION_SUCCESS') ? 'success' : 'failed',
      ualStatus,
      graphStatus
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
}, { 
  connection: redisConnection,
  concurrency: parseInt(process.env.EXTRACTOR_CONCURRENCY) || 3 // Allow 3 concurrent jobs by default
});

// Helper function to decrypt password via API
async function decryptPassword(encryptedPassword) {
  try {
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    
    const response = await axios.post(
      `${apiUrl}/api/internal/decrypt`,
      { encryptedData: encryptedPassword },
      {
        headers: {
          'x-service-token': serviceToken,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    if (response.data && response.data.success) {
      return response.data.decrypted;
    }
    
    return null;
  } catch (error) {
    logger.error('Failed to decrypt password via API:', error.message);
    return null;
  }
}

// Helper function to get user certificate info (path and password)
async function getUserCertificateInfo(organizationId, userId) {
  try {
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    
    if (!serviceToken) {
      logger.warn('SERVICE_AUTH_TOKEN not set, skipping user certificate lookup');
      return null;
    }

    const response = await axios.get(
      `${apiUrl}/api/user/certificates?organizationId=${organizationId || 'default'}`,
      {
        headers: {
          'x-service-token': serviceToken,
          'x-user-id': userId || '1' // Default user ID for compatibility
        },
        timeout: 5000
      }
    );

    if (response.data && response.data.success && response.data.certificates) {
      // Find the active certificate for this organization
      const activeCert = response.data.certificates.find(cert => 
        cert.isActive && cert.organizationId === (organizationId || 'default')
      );
      
      if (activeCert) {
        // Return the path to the uploaded certificate in the shared volume
        const certPath = path.join('/user_certificates', path.basename(activeCert.filePath));
        logger.info(`Found user certificate: ${activeCert.filename} (${activeCert.thumbprint})`);
        logger.info(`User certificate path: ${certPath}`);
        
        // Check if the file exists
        if (fsSync.existsSync(certPath)) {
          logger.info(`User certificate file verified at: ${certPath}`);
          
          return {
            path: certPath,
            encryptedPassword: activeCert.encryptedPassword,
            thumbprint: activeCert.thumbprint,
            filename: activeCert.filename
          };
        } else {
          logger.warn(`User certificate file not found at: ${certPath}, falling back to default`);
          return null;
        }
      }
    }
    
    logger.info('No active user certificate found, will use default certificate');
    return null;
  } catch (error) {
    logger.warn('Failed to fetch user certificate, falling back to default:', error.message);
    return null;
  }
}

// Build PowerShell command based on extraction type
async function buildPowerShellCommand(type, parameters, credentials, extractionId, orgOutputPath) {
  const baseCommand = `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading Microsoft-Extractor-Suite module...";
    Import-Module Microsoft-Extractor-Suite -Force;
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Module loaded successfully";
    
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading Microsoft.Graph authentication module...";
    Import-Module Microsoft.Graph.Authentication -Force;
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Microsoft.Graph.Authentication module loaded successfully";
  `;
  
  // Load additional Graph modules based on extraction type
  const graphModuleMap = {
    'azure_signin_logs': ['Microsoft.Graph.Identity.SignIns'],
    'azure_audit_logs': ['Microsoft.Graph.Identity.DirectoryManagement'], 
    'mfa_status': ['Microsoft.Graph.Users', 'Microsoft.Graph.Identity.SignIns'],
    'risky_users': ['Microsoft.Graph.Users'],
    'risky_detections': ['Microsoft.Graph.Identity.SignIns'],
    'devices': ['Microsoft.Graph.DeviceManagement'],
    'ual_graph': ['Microsoft.Graph.Identity.SignIns'],
    'licenses': ['Microsoft.Graph.Users']
  };
  
  let moduleLoadCommand = baseCommand;
  
  // Add specific Graph modules for the extraction type
  const requiredModules = graphModuleMap[type] || [];
  if (requiredModules.length > 0) {
    moduleLoadCommand += `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading additional Graph modules for ${type}...";`;
    
    requiredModules.forEach(moduleName => {
      moduleLoadCommand += `
    Import-Module ${moduleName} -Force;`;
    });
    
    moduleLoadCommand += `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Additional Graph modules loaded successfully";`;
  }
  
  let command = moduleLoadCommand;
  
  // Always use certificate file authentication (PFX) - thumbprint is optional
  if (credentials.applicationId) {
    // First, try to get user-uploaded certificate
    logger.info(`Looking for user certificate for organization: ${parameters.organizationId || 'default'}, user: ${credentials.userId || '1'}`);
    const userCertInfo = await getUserCertificateInfo(parameters.organizationId || 'default', credentials.userId || '1');
    
    // Certificate-based authentication with PFX file - cross-platform-safe certificate loading
    const mountedCertPath = '/certs/app.pfx';
    const fallbackCertPath = '/output/app.pfx';
    let certPath = mountedCertPath;
    let certPassword = process.env.CERT_PASSWORD || 'Password123'; // Use environment variable or fallback
    
    // Use user certificate if available
    if (userCertInfo) {
      certPath = userCertInfo.path;
      
      // Decrypt user certificate password if available
      if (userCertInfo.encryptedPassword) {
        const decryptedPassword = await decryptPassword(userCertInfo.encryptedPassword);
        if (decryptedPassword) {
          certPassword = decryptedPassword;
          logger.info(`Using user certificate with custom password: ${userCertInfo.filename}`);
        } else {
          logger.warn(`Failed to decrypt password for user certificate: ${userCertInfo.filename}, using default password`);
        }
      } else {
        logger.info(`Using user certificate with default password: ${userCertInfo.filename}`);
      }
    } else {
      certPath = credentials.certificateFilePath || mountedCertPath;
      certPassword = credentials.certificatePassword || process.env.CERT_PASSWORD || 'Password123';
      logger.info(`Using default certificate: ${certPath}`);
    }
    command += `
      Write-Host 'Connecting to Microsoft 365 using certificate file...';
      try {
        # Certificate loading with enhanced debugging
        Write-Host 'Certificate selection process:';
        ${userCertInfo ? `Write-Host 'User certificate specified: ${userCertInfo.filename}';` : `Write-Host 'No user certificate found, using default';`}
        
        # Path to PFX file with fallback logic
        if (Test-Path '${certPath}') { 
          $pfxPath = '${certPath}';
          Write-Host "Using certificate: $pfxPath";
          ${userCertInfo ? `Write-Host 'Certificate source: User-uploaded';` : `Write-Host 'Certificate source: Default system certificate';`}
        } else { 
          $pfxPath = '${fallbackCertPath}';
          Write-Host "Primary certificate not found, using fallback: $pfxPath";
          Write-Host 'Certificate source: Fallback system certificate';
        }
        
        # Ensure the file exists
        if (-not (Test-Path $pfxPath)) {
          Write-Error "CERTIFICATE_ERROR: PFX file not found at: $pfxPath";
          Write-Host 'Certificate search paths checked:';
          Write-Host "  - Primary: ${certPath}";
          Write-Host "  - Fallback: ${fallbackCertPath}";
          ${userCertInfo ? `Write-Host "  - User cert: ${userCertInfo.path}";` : ''}
          throw "PFX file not found at: $pfxPath";
        }
        
        # Log certificate file details
        $certFileInfo = Get-Item $pfxPath;
        Write-Host "Certificate file details:";
        Write-Host "  - Path: $($certFileInfo.FullName)";
        Write-Host "  - Size: $($certFileInfo.Length) bytes";
        Write-Host "  - Modified: $($certFileInfo.LastWriteTime)";
        
        # PFX password
        $securePwd = ConvertTo-SecureString '${certPassword}' -AsPlainText -Force;
        Write-Host 'Loading certificate with password...';
        
        # Load the certificate (cross-platform-safe overload)
        try {
          $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
            $pfxPath,
            $securePwd,
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
          );
          Write-Host 'Certificate loaded successfully';
        } catch {
          Write-Error "CERTIFICATE_LOAD_ERROR: Failed to load certificate from $pfxPath - $_";
          Write-Host 'This could indicate:';
          Write-Host '  - Incorrect certificate password';
          Write-Host '  - Corrupted certificate file';
          Write-Host '  - Invalid certificate format (must be .pfx/.p12)';
          throw "Certificate loading failed: $_";
        }
        
        # Validate certificate details
        Write-Host 'Certificate validation:';
        Write-Host "  - Subject: $($cert.Subject)";
        Write-Host "  - Issuer: $($cert.Issuer)";
        Write-Host "  - Valid From: $($cert.NotBefore)";
        Write-Host "  - Valid Until: $($cert.NotAfter)";
        Write-Host "  - Has Private Key: $($cert.HasPrivateKey)";
        
        # Check if certificate is still valid
        $now = Get-Date;
        if ($cert.NotAfter -lt $now) {
          Write-Warning "CERTIFICATE_EXPIRED: Certificate expired on $($cert.NotAfter)";
        } elseif ($cert.NotBefore -gt $now) {
          Write-Warning "CERTIFICATE_NOT_YET_VALID: Certificate not valid until $($cert.NotBefore)";
        } else {
          Write-Host "Certificate is valid (expires: $($cert.NotAfter))";
        }
        
        if (-not $cert.HasPrivateKey) {
          Write-Error "CERTIFICATE_NO_PRIVATE_KEY: Certificate does not contain a private key";
          throw "Certificate must contain a private key for authentication";
        }
        
        # Output the thumbprint
        Write-Output ("Certificate: {0}" -f $cert.Thumbprint);
        Write-Host "Certificate thumbprint: $($cert.Thumbprint)";
        
        # Connect to Exchange Online (Connect-M365) using that cert
        Write-Host "Executing Connect-M365 with AppId: ${credentials.applicationId}, Organization: ${parameters.fqdn || parameters.organization}";
        Connect-M365 -AppId '${credentials.applicationId}' -Organization '${parameters.fqdn || parameters.organization}' -Certificate $cert -ErrorAction Stop;
        Write-Host 'Connect-M365 completed successfully';
        
        # Connect to Microsoft Graph using certificate
        Write-Host "Connecting to Microsoft Graph with AppId: ${credentials.applicationId}, TenantId: ${parameters.tenantId}";
        Connect-MgGraph -ApplicationId '${credentials.applicationId}' -Certificate $cert -TenantId '${parameters.tenantId}' -ErrorAction Stop;
        Write-Host 'Connect-MgGraph completed successfully';
        
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
        
        # Test Microsoft Graph connection
        try {
          $graphContext = Get-MgContext -ErrorAction Stop;
          Write-Host "Microsoft Graph connection verified - TenantId: $($graphContext.TenantId)";
        } catch {
          Write-Error "Microsoft Graph connection verification failed";
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
        Get-UAL -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -Output JSON -MergeOutput -OutputDir '${orgOutputPath}';
        Write-Host "UAL extraction completed successfully.";
      } catch {
        Write-Error "UAL extraction failed: $_";
        throw;
      }
    `,
    'azure_signin_logs': `
      Write-Host "Starting Azure Sign-In Logs extraction via Graph...";
      Write-Host "Parameters: StartDate='${parameters.startDate}', EndDate='${parameters.endDate}'";
      $retryCount = 0;
      $maxRetries = 5;
      $baseDelaySeconds = 30;
      $completed = $false;
      
      while (-not $completed -and $retryCount -lt $maxRetries) {
        try {
          if ($retryCount -gt 0) {
            $delaySeconds = $baseDelaySeconds * [math]::Pow(2, $retryCount - 1);
            $jitter = Get-Random -Minimum 1 -Maximum 10;
            $totalDelay = $delaySeconds + $jitter;
            Write-Host "Retry attempt $retryCount/$maxRetries after $totalDelay seconds...";
            Start-Sleep -Seconds $totalDelay;
          }
          
          Get-GraphEntraSignInLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}';
          Write-Host "Graph Sign-In Logs extraction completed successfully.";
          $completed = $true;
        } catch {
          $errorMessage = $_.Exception.Message;
          Write-Host "Attempt $($retryCount + 1) failed: $errorMessage";
          
          if ($errorMessage -like "*TooManyRequests*" -or $errorMessage -like "*Too many requests*" -or $errorMessage -like "*429*") {
            $retryCount++;
            if ($retryCount -lt $maxRetries) {
              Write-Host "Rate limit hit, will retry with exponential backoff...";
            } else {
              Write-Error "Max retries exceeded for rate limiting. Please try again later.";
              throw;
            }
          } else {
            Write-Error "Graph Sign-In Logs extraction failed with non-retryable error: $errorMessage";
            throw;
          }
        }
      }
    `,
    'azure_audit_logs': `
      Write-Host "Starting Azure Audit Logs extraction via Graph...";
      Write-Host "Parameters: StartDate='${parameters.startDate}', EndDate='${parameters.endDate}'";
      $retryCount = 0;
      $maxRetries = 5;
      $baseDelaySeconds = 30;
      $completed = $false;
      
      while (-not $completed -and $retryCount -lt $maxRetries) {
        try {
          if ($retryCount -gt 0) {
            $delaySeconds = $baseDelaySeconds * [math]::Pow(2, $retryCount - 1);
            $jitter = Get-Random -Minimum 1 -Maximum 10;
            $totalDelay = $delaySeconds + $jitter;
            Write-Host "Retry attempt $retryCount/$maxRetries after $totalDelay seconds...";
            Start-Sleep -Seconds $totalDelay;
          }
          
          Get-GraphEntraAuditLogs -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}';
          Write-Host "Graph Audit Logs extraction completed successfully.";
          $completed = $true;
        } catch {
          $errorMessage = $_.Exception.Message;
          Write-Host "Attempt $($retryCount + 1) failed: $errorMessage";
          
          if ($errorMessage -like "*TooManyRequests*" -or $errorMessage -like "*Too many requests*" -or $errorMessage -like "*429*") {
            $retryCount++;
            if ($retryCount -lt $maxRetries) {
              Write-Host "Rate limit hit, will retry with exponential backoff...";
            } else {
              Write-Error "Max retries exceeded for rate limiting. Please try again later.";
              throw;
            }
          } else {
            Write-Error "Graph Audit Logs extraction failed with non-retryable error: $errorMessage";
            throw;
          }
        }
      }
    `,
    'mfa_status': `
      Write-Host "Starting MFA Status extraction via Graph...";
      try {
        Get-MFA -OutputDir '${orgOutputPath}';
        Write-Host "MFA Status extraction completed successfully.";
      } catch {
        Write-Error "MFA Status extraction failed: $_";
        throw;
      }
    `,
    'oauth_permissions': `Get-OAuthPermissions -OutputDir '${orgOutputPath}'`,
    'risky_users': `
      Write-Host "Starting Risky Users extraction via Graph...";
      try {
        Get-Users -OutputDir '${orgOutputPath}';
        Write-Host "Users extraction completed successfully.";
      } catch {
        Write-Error "Users extraction failed: $_";
        throw;
      }
    `,
    'risky_detections': `Get-RiskyDetections -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}'`,
    'mailbox_audit': `Get-MailboxAuditLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}'`,
    'message_trace': `Get-MessageTraceLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}'`,
    'devices': `
      Write-Host "Starting Devices extraction via Graph...";
      try {
        Get-Devices -OutputDir '${orgOutputPath}';
        Write-Host "Devices extraction completed successfully.";
      } catch {
        Write-Error "Devices extraction failed: $_";
        throw;
      }
    `,
    'full_extraction': `Start-EvidenceCollection -ProjectName 'MAES-Extraction' -OutputDir '${orgOutputPath}'`,
    'ual_graph': `
      Write-Host "Starting UAL extraction via Graph...";
      Write-Host "Parameters: StartDate='${parameters.startDate}', EndDate='${parameters.endDate}'";
      $retryCount = 0;
      $maxRetries = 5;
      $baseDelaySeconds = 30;
      $completed = $false;
      
      while (-not $completed -and $retryCount -lt $maxRetries) {
        try {
          if ($retryCount -gt 0) {
            $delaySeconds = $baseDelaySeconds * [math]::Pow(2, $retryCount - 1);
            $jitter = Get-Random -Minimum 1 -Maximum 10;
            $totalDelay = $delaySeconds + $jitter;
            Write-Host "Retry attempt $retryCount/$maxRetries after $totalDelay seconds...";
            Start-Sleep -Seconds $totalDelay;
          }
          
          Get-UALGraph -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -SearchName 'MAES-UAL-Graph-${extractionId}' -Output JSON -MergeOutput -OutputDir '${orgOutputPath}';
          Write-Host "UAL Graph extraction completed successfully.";
          $completed = $true;
        } catch {
          $errorMessage = $_.Exception.Message;
          Write-Host "Attempt $($retryCount + 1) failed: $errorMessage";
          
          if ($errorMessage -like "*TooManyRequests*" -or $errorMessage -like "*Too many requests*" -or $errorMessage -like "*429*") {
            $retryCount++;
            if ($retryCount -lt $maxRetries) {
              Write-Host "Rate limit hit, will retry with exponential backoff...";
            } else {
              Write-Error "Max retries exceeded for rate limiting. Please try again later.";
              throw;
            }
          } else {
            Write-Error "UAL Graph extraction failed with non-retryable error: $errorMessage";
            throw;
          }
        }
      }
    `,
    'licenses': `
      Write-Host "Starting Licenses extraction via Graph...";
      try {
        Get-Licenses -OutputDir '${orgOutputPath}';
        Write-Host "Licenses extraction completed successfully.";
      } catch {
        Write-Error "Licenses extraction failed: $_";
        throw;
      }
    `
  };
  
  command += extractionCommands[type] || '';
  
  return command;
}

// Build PowerShell command for connection testing
async function buildTestConnectionCommand(parameters) {
  const baseCommand = `
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Loading Microsoft-Extractor-Suite module...";
    Import-Module Microsoft-Extractor-Suite -Force;
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Module loaded successfully";
  `;
  
  let command = baseCommand;
  
  // Always use certificate-based authentication for connection testing
  if (parameters.applicationId) {
    // Check for user-uploaded certificate first
    logger.info(`Testing connection - looking for user certificate for organization: ${parameters.organizationId || 'default'}`);
    const userCertInfo = await getUserCertificateInfo(parameters.organizationId || 'default', '1');
    
    let certPath = '/certs/app.pfx';
    const fallbackCertPath = '/output/app.pfx';
    let certPassword = process.env.CERT_PASSWORD || 'Password123';
    
    // Use user certificate if available
    if (userCertInfo) {
      certPath = userCertInfo.path;
      
      // Decrypt user certificate password if available
      if (userCertInfo.encryptedPassword) {
        const decryptedPassword = await decryptPassword(userCertInfo.encryptedPassword);
        if (decryptedPassword) {
          certPassword = decryptedPassword;
          logger.info(`Connection test using user certificate with custom password: ${userCertInfo.filename}`);
        } else {
          logger.warn(`Failed to decrypt password for user certificate: ${userCertInfo.filename}, using default password`);
        }
      } else {
        logger.info(`Connection test using user certificate with default password: ${userCertInfo.filename}`);
      }
    } else {
      logger.info(`Connection test using default certificate: ${certPath}`);
    }
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
      
      # Connect to Microsoft Graph using certificate and tenant ID
      Connect-MgGraph -ApplicationId '${parameters.applicationId}' -Certificate $cert -TenantId '${parameters.tenantId || parameters.fqdn}' -ErrorAction Stop; 
      Write-Host 'Connect-MgGraph completed successfully';
      
      # Verify Graph connection
      try { 
        $graphContext = Get-MgContext -ErrorAction Stop; 
        Write-Host "GRAPH_CONNECTION_SUCCESS - TenantId: $($graphContext.TenantId)";
      } catch { 
        Write-Host 'GRAPH_CONNECTION_ERROR';
      }
      
      Write-Host 'CONNECTION_SUCCESS';
      
      # Test UAL availability
      try { 
        $AuditConfig = Get-AdminAuditLogConfig -ErrorAction Stop; 
        $UalEnabled = $AuditConfig.UnifiedAuditLogIngestionEnabled; 
        Write-Host "UAL_STATUS:$($UalEnabled.ToString().ToUpper())";
      } catch { 
        Write-Host 'UAL_STATUS:ERROR';
      }
      
      # Disconnect services
      Disconnect-ExchangeOnline -Confirm:$false; 
      Disconnect-MgGraph; 
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
          // Log PowerShell [INFO] messages with proper formatting
          if (line.includes('[INFO]')) {
            extractionLogger.info(line.trim());
            return;
          }
          
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
          } else if (line.includes('Loading Microsoft.Graph authentication module')) {
            extractionLogger.info('Loading Microsoft Graph authentication module...');
          } else if (line.includes('Module loaded successfully')) {
            extractionLogger.info('Module loaded successfully');
          } else if (line.includes('Microsoft.Graph.Authentication module loaded successfully')) {
            extractionLogger.info('Microsoft Graph authentication module loaded successfully');
          } else if (line.includes('Connecting to Microsoft 365')) {
            extractionLogger.info('Connecting to Microsoft 365...');
          } else if (line.includes('Connecting to Microsoft Graph')) {
            extractionLogger.info('Connecting to Microsoft Graph...');
          } else if (line.includes('Using mounted certificate')) {
            extractionLogger.info('Using certificate authentication');
          } else if (line.includes('Certificate:')) {
            extractionLogger.info(`Certificate thumbprint: ${line.split('Certificate:')[1].trim()}`);
          } else if (line.includes('Connect-M365 completed successfully')) {
            extractionLogger.info('Successfully connected to Microsoft 365');
          } else if (line.includes('Connect-MgGraph completed successfully')) {
            extractionLogger.info('Successfully connected to Microsoft Graph');
          } else if (line.includes('Microsoft Graph connection verified')) {
            extractionLogger.info('Microsoft Graph connection verified');
          } else if (line.includes('UAL_STATUS:ENABLED')) {
            extractionLogger.info('✓ Unified Audit Log is enabled');
          } else if (line.includes('UAL_STATUS:DISABLED')) {
            extractionLogger.warn('⚠ Unified Audit Log is disabled - extraction may fail');
          } else if (line.includes('Starting Unified Audit Log extraction')) {
            extractionLogger.info('Starting Unified Audit Log extraction...');
          } else if (line.includes('Starting Azure Sign-In Logs extraction')) {
            extractionLogger.info('Starting Azure Sign-In Logs extraction via Graph...');
          } else if (line.includes('Starting Azure Audit Logs extraction')) {
            extractionLogger.info('Starting Azure Audit Logs extraction via Graph...');
          } else if (line.includes('Starting MFA Status extraction')) {
            extractionLogger.info('Starting MFA Status extraction via Graph...');
          } else if (line.includes('Starting Devices extraction')) {
            extractionLogger.info('Starting Devices extraction via Graph...');
          } else if (line.includes('Starting Users extraction')) {
            extractionLogger.info('Starting Users extraction via Graph...');
          } else if (line.includes('Starting Licenses extraction')) {
            extractionLogger.info('Starting Licenses extraction via Graph...');
          } else if (line.includes('Starting UAL extraction via Graph')) {
            extractionLogger.info('Starting UAL extraction via Graph...');
          } else if (line.includes('UAL extraction completed successfully')) {
            extractionLogger.info('UAL extraction completed successfully');
          } else if (line.includes('Rate limit hit, will retry')) {
            extractionLogger.warn('⚠ Rate limit encountered, retrying with exponential backoff...');
          } else if (line.includes('Retry attempt')) {
            extractionLogger.info(line.trim());
          } else if (line.includes('Max retries exceeded for rate limiting')) {
            extractionLogger.error('Rate limit retries exhausted - please try again later');
          } else if (line.includes('extraction completed successfully')) {
            extractionLogger.info('Graph extraction completed successfully');
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
          } else if (errorMessage.includes('Connect-MgGraph') && errorMessage.includes('failed')) {
            extractionLogger.error('Microsoft Graph connection failed');
            extractionLogger.error('Please verify the Azure AD application has the required Graph API permissions');
          } else if (errorMessage.includes('GRAPH_CONNECTION_ERROR')) {
            extractionLogger.error('Microsoft Graph connection verification failed');
            extractionLogger.error('Please check the tenant ID and application permissions');
          } else if (errorMessage.includes('Unified Audit Log is not enabled')) {
            extractionLogger.error('Extraction failed: Unified Audit Log is not enabled');
            extractionLogger.error('Please enable auditing in the Microsoft 365 compliance center');
          } else if (errorMessage.includes('TooManyRequests') || errorMessage.includes('Too many requests') || errorMessage.includes('429')) {
            extractionLogger.warn('⚠ Microsoft Graph rate limit encountered - automatic retry in progress...');
          } else if (errorMessage.includes('Max retries exceeded')) {
            extractionLogger.error('Rate limit retries exhausted - extraction failed');
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
async function processOutput(extractionId, type, organizationId) {
  const outputFiles = [];
  
  try {
    const orgOutputPath = getOrganizationOutputPath(organizationId, extractionId);
    const files = await fs.readdir(orgOutputPath);
    logger.info(`Processing output for extraction ${extractionId}, type: ${type}, organization: ${organizationId}`);
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
        const filePath = path.join(orgOutputPath, file);
        const stats = await fs.stat(filePath);
        
        logger.info(`Processing data file: ${file} (size: ${stats.size} bytes)`);
        
        // Files are already in organization-scoped directory, no need to move
        const finalPath = filePath;
        
        // Add to output files with correct path
        outputFiles.push({
          filename: file,
          path: finalPath,
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

extractionWorker.on('failed', async (job, err) => {
  logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, err);
  
  const extractionId = job.data.extractionId || job.data.testId;
  const organizationId = job.data.organizationId;
  
  // If job has exceeded max attempts, mark it as permanently failed
  if (job.attemptsMade >= job.opts.attempts) {
    logger.error(`Job ${job.id} permanently failed after ${job.attemptsMade} attempts`);
    
    // Update extraction status to failed
    if (extractionId) {
      try {
        logger.info(`Updating extraction ${extractionId} status to 'failed' after max retries exceeded...`);
        await updateExtractionStatus(extractionId, organizationId, 'failed', {
          errorMessage: err.message,
          failedAt: new Date(),
          attemptsExhausted: true
        });
        logger.info(`Successfully updated extraction ${extractionId} status to 'failed' after exhausting retries`);
      } catch (updateError) {
        logger.error(`CRITICAL: Failed to update extraction status to 'failed' for ${extractionId} after exhausting retries.`, {
          originalError: err.message,
          updateError: updateError.message,
          extractionId
        });
      }
    }
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
    // Get failed, active, and waiting jobs using BullMQ's getJobs method
    const failed = await extractionQueue.getJobs(['failed']);
    const active = await extractionQueue.getJobs(['active']);
    const waiting = await extractionQueue.getJobs(['waiting']);
    
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
    
    // Check waiting jobs against API to see if they were cancelled
    if (waiting.length > 0) {
      for (const job of waiting) {
        try {
          const extractionId = job.data.extractionId || job.data.testId;
          if (extractionId) {
            const status = await getExtractionStatus(extractionId);
            if (status === 'cancelled' || status === 'failed') {
              logger.info(`Removing cancelled/failed waiting job ${job.id} (${extractionId})`);
              await job.remove();
            }
          }
        } catch (error) {
          logger.error(`Failed to check status for waiting job ${job.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('Cleanup stalled jobs failed:', error);
  }
}

// Check extraction status via API
async function getExtractionStatus(extractionId) {
  try {
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    
    const response = await axios.get(
      `${apiUrl}/api/extractions/${extractionId}`,
      {
        headers: {
          'x-service-token': serviceToken,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    if (response.data && response.data.extraction) {
      return response.data.extraction.status;
    }
    return 'unknown';
  } catch (error) {
    logger.error(`Failed to get extraction status for ${extractionId}:`, error);
    return 'unknown';
  }
}

// Startup cleanup - remove orphaned jobs that were cancelled while container was down
async function startupCleanup() {
  try {
    logger.info('Performing startup cleanup of orphaned jobs...');
    
    // Get all jobs in various states
    const allJobStates = ['waiting', 'active', 'delayed', 'failed'];
    const allJobs = await extractionQueue.getJobs(allJobStates);
    
    for (const job of allJobs) {
      try {
        const extractionId = job.data.extractionId || job.data.testId;
        if (extractionId) {
          const status = await getExtractionStatus(extractionId);
          
          // Remove jobs that were cancelled or completed while container was down
          if (status === 'cancelled' || status === 'completed' || status === 'failed') {
            logger.info(`Removing orphaned ${job.opts.jobId} job ${job.id} (${extractionId}) - API status: ${status}`);
            await job.remove();
          }
        }
      } catch (error) {
        logger.error(`Failed to cleanup orphaned job ${job.id}:`, error);
      }
    }
    
    logger.info('Startup cleanup completed');
  } catch (error) {
    logger.error('Startup cleanup failed:', error);
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
      'mfa_status': 'mfa_analysis',
      'oauth_permissions': 'oauth_analysis',
      'risky_users': 'risky_user_analysis',
      'risky_detections': 'risky_detection_analysis',
      'devices': 'device_analysis',
      'ual_graph': 'ual_analysis',
      'licenses': 'comprehensive_analysis',
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
            'x-organization-id': organizationId,
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

// Helper function to update extraction status via API with retry logic
async function updateExtractionStatus(extractionId, organizationId, status, metadata = {}, retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  try {
    const apiUrl = process.env.API_URL || 'http://api:3000';
    const serviceToken = process.env.SERVICE_AUTH_TOKEN;
    
    if (!serviceToken) {
      throw new Error('SERVICE_AUTH_TOKEN environment variable is not set');
    }
    
    logger.info(`Updating extraction ${extractionId} status to '${status}' for organization ${organizationId} (attempt ${retryCount + 1})`);
    
    const response = await axios.patch(
      `${apiUrl}/api/extractions/${extractionId}/status`,
      {
        status,
        ...metadata
      },
      {
        headers: {
          'x-service-token': serviceToken,
          'x-organization-id': organizationId,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // Increased timeout
      }
    );
    
    if (response.data && response.data.success) {
      logger.info(`Successfully updated extraction ${extractionId} status to '${status}'`);
      return true;
    } else {
      throw new Error(`API response indicated failure: ${JSON.stringify(response.data)}`);
    }
    
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message;
    logger.error(`Failed to update extraction status (attempt ${retryCount + 1}/${maxRetries + 1}):`, {
      extractionId,
      status,
      error: errorMessage,
      statusCode: error.response?.status,
      url: `${process.env.API_URL || 'http://api:3000'}/api/extractions/${extractionId}/status`
    });
    
    // Retry logic
    if (retryCount < maxRetries) {
      logger.info(`Retrying status update for extraction ${extractionId} in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return updateExtractionStatus(extractionId, organizationId, status, metadata, retryCount + 1);
    } else {
      logger.error(`Max retries (${maxRetries}) exceeded for updating extraction ${extractionId} status. This may cause UI to show incorrect status.`);
      throw error;
    }
  }
}

// Run startup cleanup to remove orphaned jobs
startupCleanup().then(() => {
  logger.info('Extractor service started and listening for jobs');
}).catch(error => {
  logger.error('Startup cleanup failed, but service will continue:', error);
  logger.info('Extractor service started and listening for jobs');
});

// Add Express server for cleanup API
const express = require('express');
const cleanupRouter = require('./cleanup');

const app = express();
const PORT = process.env.CLEANUP_PORT || 3000;

app.use(express.json());
app.use('/api/cleanup', cleanupRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'extractor',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Extractor cleanup API server listening on port ${PORT}`);
});