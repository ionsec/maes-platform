const http = require('http');
const fs = require('fs');
const { logger } = require('../utils/logger');
const { pool } = require('./database');
const { extractionQueue, analysisQueue } = require('./jobService');

// Downstream services expose a /health endpoint on the compose network.
// Allow override via env for non-compose deployments.
const EXTRACTOR_HEALTH_URL = process.env.EXTRACTOR_HEALTH_URL || 'http://extractor:3000/health';
const ANALYZER_HEALTH_URL = process.env.ANALYZER_HEALTH_URL || 'http://analyzer:3000/health';

// Storage locations we check for writability, first existing wins.
const STORAGE_PATHS = [
  process.env.EXTRACTION_OUTPUT_DIR,
  process.env.DATA_DIR,
  process.env.OUTPUT_DIR,
  '/app/data'
].filter(Boolean);

function pingHttp(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    return 'healthy';
  } catch (error) {
    logger.error('Database health check failed:', error);
    return 'unhealthy';
  }
}

async function checkRedis() {
  try {
    // Use the extraction queue's underlying Redis client for a live ping.
    const client = extractionQueue.client;
    await client.ping();
    return 'healthy';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return 'unhealthy';
  }
}

async function checkService(url, name) {
  try {
    const ok = await pingHttp(url);
    return ok ? 'healthy' : 'unhealthy';
  } catch (error) {
    logger.error(`${name} health check failed:`, error);
    return 'unhealthy';
  }
}

function checkStorage() {
  // Use the first configured path, or the working directory as a fallback.
  const target = STORAGE_PATHS[0] || process.cwd();
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return 'healthy';
  } catch (error) {
    // The directory may not exist yet; try to create it before failing.
    try {
      fs.mkdirSync(target, { recursive: true });
      fs.accessSync(target, fs.constants.W_OK);
      return 'healthy';
    } catch (mkdirError) {
      logger.error(`Storage health check failed for ${target}:`, mkdirError);
      return 'unhealthy';
    }
  }
}

/**
 * Gather real status for each subsystem. Downstream services report
 * 'unknown' when their endpoint cannot be reached, so the UI can distinguish
 * "not deployed" from "down".
 */
async function checkSystemHealth() {
  const [database, redis, extractor, analyzer, storage] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkService(EXTRACTOR_HEALTH_URL, 'extractor'),
    checkService(ANALYZER_HEALTH_URL, 'analyzer'),
    checkStorage()
  ]);

  return {
    api: 'healthy',
    database,
    redis,
    extractor,
    analyzer,
    storage,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

module.exports = { checkSystemHealth };
