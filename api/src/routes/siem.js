const express = require('express');
const { query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const { pool } = require('../services/database');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * @swagger
 * /api/siem/events:
 *   get:
 *     summary: Export security events in SIEM format
 *     tags: [SIEM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [splunk, qradar, cef, json]
 *         description: SIEM format
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for events
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for events
 *       - in: query
 *         name: eventTypes
 *         schema:
 *           type: string
 *         description: Comma-separated list of event types
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity
 *     responses:
 *       200:
 *         description: SIEM formatted events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/events',
  requirePermission('canExportData'),
  [
    query('format').isIn(['splunk', 'qradar', 'cef', 'json']).withMessage('Invalid format'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('eventTypes').optional().isString().withMessage('Event types must be string'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { format, startDate, endDate, eventTypes, severity } = req.query;

      // Build query conditions
      let whereClause = 'WHERE organization_id = $1';
      const values = [req.organizationId];
      let paramCount = 2;

      if (startDate) {
        whereClause += ` AND created_at >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        whereClause += ` AND created_at <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      }

      if (severity) {
        whereClause += ` AND severity = $${paramCount}`;
        values.push(severity);
        paramCount++;
      }

      if (eventTypes) {
        const types = eventTypes.split(',').map(t => t.trim());
        whereClause += ` AND category = ANY($${paramCount})`;
        values.push(types);
        paramCount++;
      }

      // Get events from database
      const { getRows } = require('../services/database');
      const eventsQuery = `
        SELECT 
          id,
          title,
          description,
          severity,
          category,
          mitre_techniques,
          affected_entities,
          created_at,
          updated_at
        FROM maes.alerts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 1000
      `;

      const events = await getRows(eventsQuery, values);

      // Format events based on SIEM format
      let formattedEvents;
      switch (format) {
        case 'splunk':
          formattedEvents = formatForSplunk(events);
          break;
        case 'qradar':
          formattedEvents = formatForQRadar(events);
          break;
        case 'cef':
          formattedEvents = formatForCEF(events);
          break;
        case 'json':
        default:
          formattedEvents = events;
          break;
      }

      res.json({
        success: true,
        format,
        totalEvents: events.length,
        events: formattedEvents
      });

    } catch (error) {
      logger.error('SIEM export error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/siem/download:
 *   get:
 *     summary: Download security events in various formats
 *     tags: [SIEM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json, xml, cef]
 *         description: Download format
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for events
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for events
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/download',
  requirePermission('canExportData'),
  [
    query('format').isIn(['csv', 'json', 'xml', 'cef']).withMessage('Invalid format'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { format, startDate, endDate } = req.query;

      // Build query conditions
      let whereClause = 'WHERE organization_id = $1';
      const values = [req.organizationId];
      let paramCount = 2;

      if (startDate) {
        whereClause += ` AND created_at >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        whereClause += ` AND created_at <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      }

      // Get events from database
      const { getRows } = require('../services/database');
      const eventsQuery = `
        SELECT 
          id,
          title,
          description,
          severity,
          category,
          mitre_techniques,
          affected_entities,
          created_at,
          updated_at
        FROM maes.alerts
        ${whereClause}
        ORDER BY created_at DESC
      `;

      const events = await getRows(eventsQuery, values);

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `maes-security-events-${timestamp}.${format}`;

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Format and send file based on format
      switch (format) {
        case 'csv':
          res.setHeader('Content-Type', 'text/csv');
          res.send(formatAsCSV(events));
          break;
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.json({
            exportDate: new Date().toISOString(),
            totalEvents: events.length,
            events: events
          });
          break;
        case 'xml':
          res.setHeader('Content-Type', 'application/xml');
          res.send(formatAsXML(events));
          break;
        case 'cef':
          res.setHeader('Content-Type', 'text/plain');
          res.send(formatAsCEF(events));
          break;
        default:
          res.status(400).json({ error: 'Unsupported format' });
      }

    } catch (error) {
      logger.error('SIEM download error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Helper functions for formatting
function formatForSplunk(events) {
  return events.map(event => ({
    _time: event.created_at,
    _raw: JSON.stringify(event),
    sourcetype: 'maes:security:events',
    source: 'maes-platform',
    host: 'maes-server',
    index: 'security',
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      severity: event.severity,
      category: event.category,
      mitreTechniques: event.mitre_techniques,
      affectedEntities: event.affected_entities,
      timestamp: event.created_at
    }
  }));
}

function formatForQRadar(events) {
  return events.map(event => ({
    qid: generateQID(event.category, event.severity),
    qidName: event.title,
    qidDescription: event.description,
    magnitude: getMagnitude(event.severity),
    credibility: 10,
    relevance: 10,
    sourceIP: '0.0.0.0',
    destinationIP: '0.0.0.0',
    username: 'unknown',
    starttime: new Date(event.created_at).getTime(),
    devicetype: 0,
    protocolid: 0,
    sourceport: 0,
    destinationport: 0,
    logsourcetypeid: 0,
    eventcount: 1,
    eventdata: JSON.stringify(event)
  }));
}


function formatForCEF(events) {
  return events.map(event => {
    const severity = getCEFSeverity(event.severity);
    const deviceProduct = 'MAES Platform';
    const deviceVersion = '1.0.0';
    const signatureID = generateSignatureID(event.category);
    const name = event.title;
    const severityStr = severity.toString();
    
    // CEF format: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
    const extension = `msg=${event.description} suser=unknown duser=unknown`;
    
    return `CEF:0|IONSEC.IO|${deviceProduct}|${deviceVersion}|${signatureID}|${name}|${severityStr}|${extension}`;
  });
}

function formatAsCSV(events) {
  const headers = ['ID', 'Title', 'Description', 'Severity', 'Category', 'MITRE Techniques', 'Affected Entities', 'Created At', 'Updated At'];
  const csvRows = [headers.join(',')];
  
  events.forEach(event => {
    const row = [
      event.id,
      `"${event.title.replace(/"/g, '""')}"`,
      `"${event.description.replace(/"/g, '""')}"`,
      event.severity,
      event.category,
      `"${(event.mitre_techniques || []).join(';')}"`,
      `"${JSON.stringify(event.affected_entities || {}).replace(/"/g, '""')}"`,
      event.created_at,
      event.updated_at
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

function formatAsXML(events) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<maes-security-events>\n';
  xml += `  <export-date>${new Date().toISOString()}</export-date>\n`;
  xml += `  <total-events>${events.length}</total-events>\n`;
  xml += '  <events>\n';
  
  events.forEach(event => {
    xml += '    <event>\n';
    xml += `      <id>${event.id}</id>\n`;
    xml += `      <title>${escapeXML(event.title)}</title>\n`;
    xml += `      <description>${escapeXML(event.description)}</description>\n`;
    xml += `      <severity>${event.severity}</severity>\n`;
    xml += `      <category>${event.category}</category>\n`;
    xml += `      <created-at>${event.created_at}</created-at>\n`;
    xml += `      <updated-at>${event.updated_at}</updated-at>\n`;
    xml += '    </event>\n';
  });
  
  xml += '  </events>\n';
  xml += '</maes-security-events>';
  
  return xml;
}

function formatAsCEF(events) {
  return formatForCEF(events).join('\n');
}

// Helper functions
function generateQID(category, severity) {
  const categoryMap = {
    'authentication': 1000,
    'authorization': 2000,
    'data_access': 3000,
    'configuration': 4000,
    'malware': 5000,
    'policy_violation': 6000
  };
  
  const severityMap = {
    'low': 1,
    'medium': 2,
    'high': 3,
    'critical': 4
  };
  
  return (categoryMap[category] || 9999) + (severityMap[severity] || 1);
}

function getMagnitude(severity) {
  const magnitudeMap = {
    'low': 1,
    'medium': 3,
    'high': 7,
    'critical': 10
  };
  return magnitudeMap[severity] || 1;
}

function getCEFSeverity(severity) {
  const severityMap = {
    'low': 1,
    'medium': 3,
    'high': 6,
    'critical': 10
  };
  return severityMap[severity] || 1;
}

function generateSignatureID(category) {
  const signatureMap = {
    'authentication': 'AUTH-001',
    'authorization': 'AUTHZ-001',
    'data_access': 'DATA-001',
    'configuration': 'CONFIG-001',
    'malware': 'MALWARE-001',
    'policy_violation': 'POLICY-001'
  };
  return signatureMap[category] || 'UNKNOWN-001';
}

function escapeXML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = router; 