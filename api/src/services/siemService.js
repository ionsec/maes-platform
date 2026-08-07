const http = require('http');
const https = require('https');
const { logger } = require('../utils/logger');
const { pool } = require('./database');

/**
 * Build auth headers for a given SIEM type.
 */
function authHeaders(config) {
  if (!config.apiKey) return {};
  switch (config.type) {
    case 'splunk':
      return { Authorization: `Splunk ${config.apiKey}` };
    case 'qradar':
      return { 'SEC-Token': config.apiKey };
    default:
      return { Authorization: `Bearer ${config.apiKey}` };
  }
}

function request(url, { method = 'GET', headers = {}, body, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return reject(new Error('Invalid endpoint URL'));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const payload = body ? Buffer.from(body) : null;

    const req = lib.request(
      parsed,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode, body: text });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out'));
    });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Test a SIEM configuration by sending a lightweight request to its endpoint.
 */
async function testConnection(config) {
  const startedAt = Date.now();
  try {
    const res = await request(config.endpoint, {
      method: 'GET',
      headers: authHeaders(config)
    });
    const responseTime = Date.now() - startedAt;
    const success = res.statusCode >= 200 && res.statusCode < 300;
    return {
      success,
      responseTime,
      statusCode: res.statusCode,
      message: success
        ? `Successfully connected to ${config.name}`
        : `Endpoint responded with HTTP ${res.statusCode}`
    };
  } catch (error) {
    return {
      success: false,
      responseTime: Date.now() - startedAt,
      message: `Connection failed: ${error.message}`
    };
  }
}

/**
 * Fetch the organization's security events from the alerts table.
 */
async function fetchEvents(organizationId, limit = 1000) {
  const result = await pool.query(
    `SELECT id, title, description, severity, category, mitre_techniques,
            affected_entities, created_at
     FROM maes.alerts
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return result.rows;
}

/**
 * Export events to a configured SIEM endpoint. Returns a summary regardless of
 * whether the remote accepted them, so the caller can report the outcome.
 */
async function exportEvents(config, organizationId) {
  const events = await fetchEvents(organizationId, 1000);
  const payload = {
    source: 'maes-platform',
    sourcetype: 'maes:security_events',
    host: 'maes',
    event: events,
    exportedAt: new Date().toISOString()
  };

  try {
    const res = await request(config.endpoint, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(payload)
    });
    const success = res.statusCode >= 200 && res.statusCode < 300;
    return {
      success,
      eventCount: events.length,
      statusCode: res.statusCode,
      message: success
        ? `Exported ${events.length} events to ${config.name}`
        : `SIEM endpoint returned HTTP ${res.statusCode}`
    };
  } catch (error) {
    logger.error('SIEM export error:', error);
    return {
      success: false,
      eventCount: events.length,
      message: `Export failed: ${error.message}`
    };
  }
}

module.exports = { testConnection, exportEvents };
