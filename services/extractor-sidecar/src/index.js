const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { logger, createExtractionLogger } = require('./logger');

const app = express();
app.use(express.json());

const OUTPUT_PATH = '/output';
const CERT_PASSWORD_FILE_PATH = path.join(OUTPUT_PATH, 'cert_password.txt');
const PORT = process.env.SIDECAR_PORT || 3001;

// PowerShell extraction types supported by this sidecar
const SUPPORTED_TYPES = [
  'unified_audit_log',
  'admin_audit_log',
  'mailbox_audit',
  'transport_rules',
  'message_trace'
];

async function getDefaultCertificatePassword() {
  if (process.env.CERT_PASSWORD) return process.env.CERT_PASSWORD;
  try {
    return (await fs.readFile(CERT_PASSWORD_FILE_PATH, 'utf8')).trim();
  } catch {
    throw new Error('Default certificate password not configured');
  }
}

/**
 * Build PowerShell command for Tier 3 Exchange-only extractions.
 */
function buildPowerShellCommand(type, parameters, credentials, orgOutputPath) {
  const baseCommand = `
    Import-Module Microsoft-Extractor-Suite -Force;
    Import-Module Microsoft.Graph.Authentication -Force;
  `;

  let authCommand = '';
  if (credentials.applicationId) {
    let certPath = credentials.certPath || '/output/app.pfx';
    const certPassword = credentials.certPassword;

    authCommand = `
      $securePwd = ConvertTo-SecureString '${certPassword}' -AsPlainText -Force;
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        '${certPath}',
        $securePwd,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
      );
      Connect-M365 -AppId '${credentials.applicationId}' -Organization '${parameters.fqdn || parameters.organization}' -Certificate $cert -ErrorAction Stop;
      Connect-MgGraph -ApplicationId '${credentials.applicationId}' -Certificate $cert -TenantId '${parameters.tenantId}' -ErrorAction Stop;
    `;
  }

  const extractionCommands = {
    'unified_audit_log': `Get-UAL -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -Output JSON -MergeOutput -OutputDir '${orgOutputPath}'`,
    'admin_audit_log': `Get-AdminAuditLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -Output JSON -MergeOutput -OutputDir '${orgOutputPath}'`,
    'mailbox_audit': `Get-MailboxAuditLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -Output JSON -MergeOutput -OutputDir '${orgOutputPath}'`,
    'transport_rules': `Get-TransportRules -OutputDir '${orgOutputPath}'`,
    'message_trace': `Get-MessageTraceLog -StartDate '${parameters.startDate}' -EndDate '${parameters.endDate}' -OutputDir '${orgOutputPath}'`
  };

  const extractionCmd = extractionCommands[type];
  if (!extractionCmd) {
    throw new Error(`Unsupported extraction type for sidecar: ${type}`);
  }

  return baseCommand + authCommand + extractionCmd;
}

/**
 * Execute a PowerShell command and return results.
 */
function executePowerShell(command, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ps.kill('SIGKILL');
      reject(new Error(`PowerShell timed out after ${timeoutMs / 1000 / 60} minutes`));
    }, timeoutMs);

    const ps = spawn('pwsh', ['-Command', command], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', (data) => { stdout += data.toString(); });
    ps.stderr.on('data', (data) => { stderr += data.toString(); });

    ps.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve({ stdout, stderr, statistics: parseStatistics(stdout) });
      }
    });

    ps.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`PowerShell spawn error: ${err.message}`));
    });
  });
}

function parseStatistics(output) {
  const stats = { totalEvents: 0, uniqueUsers: 0, uniqueOperations: 0 };
  const totalMatch = output.match(/Total Events:\s*(\d+)/i);
  if (totalMatch) stats.totalEvents = parseInt(totalMatch[1], 10);
  const usersMatch = output.match(/Unique Users:\s*(\d+)/i);
  if (usersMatch) stats.uniqueUsers = parseInt(usersMatch[1], 10);
  const opsMatch = output.match(/Unique Operations:\s*(\d+)/i);
  if (opsMatch) stats.uniqueOperations = parseInt(opsMatch[1], 10);
  return stats;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'extractor-sidecar', timestamp: new Date().toISOString() });
});

// Extraction endpoint
app.post('/api/extract', async (req, res) => {
  const { type, parameters, credentials, organizationId, extractionId } = req.body;

  if (!SUPPORTED_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Unsupported extraction type: ${type}. Supported: ${SUPPORTED_TYPES.join(', ')}`
    });
  }

  const orgOutputPath = path.join(OUTPUT_PATH, 'orgs', (organizationId || 'default').replace(/[^a-zA-Z0-9-]/g, ''), extractionId);

  try {
    await fs.mkdir(orgOutputPath, { recursive: true });

    // Resolve certificate password
    const resolvedCredentials = { ...credentials };
    if (!resolvedCredentials.certPassword) {
      resolvedCredentials.certPassword = await getDefaultCertificatePassword();
    }
    if (!resolvedCredentials.certPath) {
      resolvedCredentials.certPath = '/output/app.pfx';
    }

    logger.info(`Sidecar: Starting extraction ${extractionId} of type ${type}`);
    const command = buildPowerShellCommand(type, parameters, resolvedCredentials, orgOutputPath);
    const result = await executePowerShell(command);

    logger.info(`Sidecar: Extraction ${extractionId} completed successfully`);

    res.json({
      success: true,
      extractionId,
      statistics: result.statistics,
      output: result.stdout.slice(-2000) // Last 2000 chars for debugging
    });
  } catch (error) {
    logger.error(`Sidecar: Extraction ${extractionId} failed:`, error);
    res.status(500).json({
      success: false,
      extractionId,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  logger.info(`MAES Extractor Sidecar listening on port ${PORT}`);
  logger.info(`Supported extraction types: ${SUPPORTED_TYPES.join(', ')}`);
});