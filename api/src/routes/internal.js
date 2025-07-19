const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const EncryptionUtil = require('../utils/encryption');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

const router = express.Router();

// Middleware to verify service token
const verifyServiceToken = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  
  if (!serviceToken || serviceToken !== process.env.SERVICE_AUTH_TOKEN) {
    logger.warn('Unauthorized internal API access attempt', {
      ip: req.ip,
      path: req.path,
      headers: req.headers
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Apply service token verification to all routes
router.use(verifyServiceToken);

/**
 * Decrypt encrypted data
 * This endpoint is only accessible by internal services with the service token
 */
router.post('/decrypt', async (req, res) => {
  try {
    const { encryptedData } = req.body;
    
    if (!encryptedData) {
      return res.status(400).json({ error: 'Missing encrypted data' });
    }
    
    const decrypted = EncryptionUtil.decrypt(encryptedData);
    
    res.json({
      success: true,
      decrypted
    });
  } catch (error) {
    logger.error('Decryption error:', error);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

/**
 * Encrypt data
 * This endpoint is only accessible by internal services with the service token
 */
router.post('/encrypt', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Missing data to encrypt' });
    }
    
    const encrypted = EncryptionUtil.encrypt(data);
    
    res.json({
      success: true,
      encrypted
    });
  } catch (error) {
    logger.error('Encryption error:', error);
    res.status(500).json({ error: 'Encryption failed' });
  }
});

/**
 * Get system logs from Docker containers
 * This endpoint fetches real logs from the Docker containers
 */
router.get('/system-logs', async (req, res) => {
  try {
    const { 
      container = 'all', 
      lines = '100', 
      since = '', 
      level = 'all',
      search = '' 
    } = req.query;

    const containers = ['maes-api', 'maes-extractor', 'maes-analyzer', 'maes-postgres', 'maes-redis'];
    const logsData = [];

    const targetContainers = container === 'all' ? containers : [container];

    for (const containerName of targetContainers) {
      try {
        let dockerCommand = `docker logs ${containerName}`;
        if (lines !== 'all') dockerCommand += ` --tail ${lines}`;
        if (since) dockerCommand += ` --since ${since}`;
        dockerCommand += ' --timestamps 2>&1';

        const { stdout, stderr } = await execAsync(dockerCommand);
        const logLines = (stdout + stderr).split('\n').filter(line => line.trim());

        for (const line of logLines) {
          if (!line.trim()) continue;

          const logEntry = parseLogLine(line, containerName);
          
          // Apply filters
          if (level !== 'all' && logEntry.level !== level) continue;
          if (search && !logEntry.message.toLowerCase().includes(search.toLowerCase()) && 
                     !logEntry.rawLine.toLowerCase().includes(search.toLowerCase())) continue;

          logsData.push(logEntry);
        }
      } catch (containerError) {
        logger.warn(`Failed to get logs from container ${containerName}:`, containerError.message);
        // Continue with other containers
      }
    }

    // Sort by timestamp (newest first)
    logsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit results for performance
    const maxResults = 1000;
    const limitedLogs = logsData.slice(0, maxResults);

    res.json({
      success: true,
      logs: limitedLogs,
      totalFetched: logsData.length,
      limitApplied: logsData.length > maxResults,
      containers: targetContainers
    });

  } catch (error) {
    logger.error('System logs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch system logs' });
  }
});

/**
 * Parse a raw Docker log line into structured data
 */
function parseLogLine(rawLine, containerName) {
  const timestampRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.+)$/;
  const match = rawLine.match(timestampRegex);
  
  let timestamp, content;
  if (match) {
    timestamp = match[1];
    content = match[2];
  } else {
    timestamp = new Date().toISOString();
    content = rawLine;
  }

  // Try to parse JSON logs (from our application)
  let level = 'info';
  let message = content;
  let service = containerName.replace('maes-', '');
  let details = null;
  let requestId = null;
  let userId = null;

  try {
    const jsonLog = JSON.parse(content);
    if (jsonLog.level) level = jsonLog.level;
    if (jsonLog.message) message = jsonLog.message;
    if (jsonLog.service) service = jsonLog.service;
    if (jsonLog.timestamp) timestamp = jsonLog.timestamp;
    if (jsonLog.requestId) requestId = jsonLog.requestId;
    if (jsonLog.userId) userId = jsonLog.userId;
    
    // Store additional metadata
    details = {
      ...jsonLog,
      message: undefined, // Don't duplicate message
      level: undefined,   // Don't duplicate level
      timestamp: undefined // Don't duplicate timestamp
    };
    
    // Remove empty details
    if (Object.keys(details).length === 0) details = null;
  } catch (e) {
    // Not JSON, try to parse common log patterns
    if (content.includes('ERROR') || content.includes('error')) level = 'error';
    else if (content.includes('WARN') || content.includes('warn')) level = 'warning';
    else if (content.includes('DEBUG') || content.includes('debug')) level = 'debug';
    
    // Try to extract PostgreSQL log format
    const pgLogMatch = content.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ UTC) \[(\d+)\] (\w+):\s+(.+)$/);
    if (pgLogMatch) {
      timestamp = new Date(pgLogMatch[1]).toISOString();
      level = pgLogMatch[3].toLowerCase();
      message = pgLogMatch[4];
      details = { pid: pgLogMatch[2] };
    }
  }

  return {
    id: `${containerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    level: level === 'warn' ? 'warning' : level, // Normalize warn to warning
    source: service,
    container: containerName,
    message,
    details,
    requestId,
    userId,
    rawLine: rawLine // Store the complete raw log line
  };
}

module.exports = router;