const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdminRole, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const axios = require('axios');

const router = express.Router();

router.use(apiRateLimiter);

const RECON_SERVICE_URL = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
const SERVICE_HEADERS = () => ({
  'x-service-token': process.env.SERVICE_AUTH_TOKEN,
  'Content-Type': 'application/json'
});

const PROFILES = ['passive', 'standard', 'aggressive'];

/**
 * Relay an error from the recon service without flattening its status.
 * A 403 from the authorization gate must reach the operator as a 403, with the
 * explanation intact — it is the difference between "your scan was refused
 * because it is out of scope" and an opaque server error.
 */
function relayError(res, error, fallbackMessage) {
  if (error.response) {
    return res.status(error.response.status || 500).json({
      error: error.response.data?.error || fallbackMessage,
      message: error.response.data?.message || error.message
    });
  }
  return res.status(500).json({ error: fallbackMessage, message: error.message });
}

// Start an external exposure scan.
router.post('/scan/:organizationId',
  authenticateToken,
  requireAdminRole(),
  [
    body('seedDomain').isLength({ min: 3, max: 253 }).withMessage('seedDomain is required'),
    body('profile').optional().isIn(PROFILES),
    body('name').optional().isLength({ min: 1, max: 255 }),
    body('description').optional().isLength({ max: 1000 }),
    body('seedUser').optional().isEmail()
  ],
  async (req, res) => {
    const { organizationId } = req.params;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { seedDomain, profile = 'passive', name, description, seedUser } = req.body;

      logger.info(
        `User ${req.user.id} requested a ${profile} external exposure scan of ${seedDomain} `
        + `for organization ${organizationId}`
      );

      const response = await axios.post(`${RECON_SERVICE_URL}/api/recon/start`, {
        organizationId,
        seedDomain,
        profile,
        options: {
          name,
          description,
          seedUser,
          triggeredBy: req.user.id,
          isScheduled: false
        }
      }, { headers: SERVICE_HEADERS(), timeout: 10000 });

      res.json({
        success: true,
        message: 'External exposure scan queued successfully',
        jobId: response.data.jobId,
        profile,
        seedDomain,
        organizationId
      });

    } catch (error) {
      logger.error(`Error starting external exposure scan for organization ${organizationId}:`, error.message);
      return relayError(res, error, 'Failed to start external exposure scan');
    }
  }
);

// Scan history for an organization.
router.get('/scans/:organizationId',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const { limit = 25, offset = 0 } = req.query;
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/scans/${req.params.organizationId}`,
        { headers: SERVICE_HEADERS(), params: { limit, offset }, timeout: 15000 }
      );
      res.json(response.data);
    } catch (error) {
      logger.error('Error fetching external exposure scans:', error.message);
      return relayError(res, error, 'Failed to fetch scans');
    }
  }
);

// Scan detail, including findings, attack paths and optionally the probe log.
router.get('/scan/:scanId',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const { includeFindings = 'true', includeProbeLog = 'false' } = req.query;
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/scan/${req.params.scanId}`,
        {
          headers: SERVICE_HEADERS(),
          params: { includeFindings, includeProbeLog },
          timeout: 30000
        }
      );
      res.json(response.data);
    } catch (error) {
      logger.error('Error fetching external exposure scan:', error.message);
      return relayError(res, error, 'Failed to fetch scan');
    }
  }
);

// The probe audit trail on its own, for review of what a scan actually sent.
router.get('/scan/:scanId/probe-log',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/scan/${req.params.scanId}`,
        {
          headers: SERVICE_HEADERS(),
          params: { includeFindings: 'false', includeProbeLog: 'true' },
          timeout: 30000
        }
      );
      res.json({ success: true, probeLog: response.data.probeLog || [] });
    } catch (error) {
      logger.error('Error fetching recon probe log:', error.message);
      return relayError(res, error, 'Failed to fetch probe log');
    }
  }
);

// --- Reports --------------------------------------------------------------

router.post('/scan/:scanId/report',
  authenticateToken,
  requirePermission('canManageCompliance'),
  [
    body('format').optional().isIn(['html', 'pdf', 'json', 'csv']),
    body('includeProbeLog').optional().isBoolean(),
    body('includeEvidence').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { format = 'html', includeProbeLog = false, includeEvidence = true } = req.body;

      const response = await axios.post(
        `${RECON_SERVICE_URL}/api/recon/scan/${req.params.scanId}/report`,
        {
          format,
          options: { includeProbeLog, includeEvidence, generatedBy: req.user.id }
        },
        // PDF rendering launches a browser; give it room rather than timing out
        // on a large scan and leaving an orphaned report behind.
        { headers: SERVICE_HEADERS(), timeout: 120000 }
      );

      logger.info(
        `User ${req.user.id} generated a ${format} external exposure report for scan ${req.params.scanId}`
      );
      res.json(response.data);

    } catch (error) {
      logger.error('Error generating external exposure report:', error.message);
      return relayError(res, error, 'Failed to generate report');
    }
  }
);

router.get('/scan/:scanId/reports',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/scan/${req.params.scanId}/reports`,
        { headers: SERVICE_HEADERS(), timeout: 15000 }
      );
      res.json(response.data);
    } catch (error) {
      logger.error('Error listing external exposure reports:', error.message);
      return relayError(res, error, 'Failed to list reports');
    }
  }
);

router.get('/scan/:scanId/report/:fileName/download',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/scan/${req.params.scanId}/report/`
          + `${encodeURIComponent(req.params.fileName)}/download`,
        { headers: SERVICE_HEADERS(), responseType: 'arraybuffer', timeout: 60000 }
      );

      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Disposition',
        response.headers['content-disposition'] || `attachment; filename="${req.params.fileName}"`);
      res.send(Buffer.from(response.data));

    } catch (error) {
      logger.error('Error downloading external exposure report:', error.message);
      return relayError(res, error, 'Failed to download report');
    }
  }
);

// --- Schedules ------------------------------------------------------------

// Recon schedules share the compliance schedule lifecycle in the service; the
// schedule_kind discriminator keeps them apart.
router.post('/schedules/:organizationId',
  authenticateToken,
  requireAdminRole(),
  [
    body('name').notEmpty().isLength({ min: 1, max: 255 }),
    body('frequency').isIn(['daily', 'weekly', 'monthly', 'quarterly']),
    body('seedDomain').isLength({ min: 3, max: 253 }),
    body('profile').isIn(PROFILES),
    body('description').optional().isLength({ max: 1000 }),
    body('seedUser').optional().isEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { name, description, frequency, seedDomain, profile, seedUser } = req.body;

      const response = await axios.post(`${RECON_SERVICE_URL}/api/schedule`, {
        organizationId: req.params.organizationId,
        name,
        description,
        frequency,
        scheduleKind: 'external_exposure',
        seedDomain,
        reconProfile: profile,
        createdBy: req.user.id,
        parameters: seedUser ? { seedUser } : {}
      }, { headers: SERVICE_HEADERS(), timeout: 15000 });

      logger.info(
        `User ${req.user.id} scheduled a ${frequency} ${profile} external exposure scan of ${seedDomain} `
        + `for organization ${req.params.organizationId}`
      );

      res.json(response.data);

    } catch (error) {
      logger.error('Error creating external exposure schedule:', error.message);
      return relayError(res, error, 'Failed to create schedule');
    }
  }
);

router.get('/schedules/:organizationId',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/schedules/${req.params.organizationId}`,
        { headers: SERVICE_HEADERS(), timeout: 15000 }
      );

      const schedules = (response.data.schedules || [])
        .filter(s => s.schedule_kind === 'external_exposure');

      res.json({ success: true, schedules });

    } catch (error) {
      logger.error('Error listing external exposure schedules:', error.message);
      return relayError(res, error, 'Failed to list schedules');
    }
  }
);

router.delete('/schedules/:organizationId/:scheduleId',
  authenticateToken,
  requireAdminRole(),
  async (req, res) => {
    try {
      const response = await axios.delete(
        `${RECON_SERVICE_URL}/api/schedule/${req.params.scheduleId}`,
        { headers: SERVICE_HEADERS(), timeout: 15000 }
      );
      logger.info(`User ${req.user.id} deleted external exposure schedule ${req.params.scheduleId}`);
      res.json(response.data);
    } catch (error) {
      logger.error('Error deleting external exposure schedule:', error.message);
      return relayError(res, error, 'Failed to delete schedule');
    }
  }
);

// --- Scope authorizations -------------------------------------------------

router.get('/authorizations/:organizationId',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const response = await axios.get(
        `${RECON_SERVICE_URL}/api/recon/authorizations/${req.params.organizationId}`,
        { headers: SERVICE_HEADERS(), timeout: 15000 }
      );
      res.json(response.data);
    } catch (error) {
      logger.error('Error fetching recon authorizations:', error.message);
      return relayError(res, error, 'Failed to fetch authorizations');
    }
  }
);

// Recording an authorization is what unlocks the aggressive tier, so it is
// restricted to administrators and always attributed to the calling user.
router.post('/authorizations/:organizationId',
  authenticateToken,
  requireAdminRole(),
  [
    body('domains').isArray({ min: 1 }).withMessage('At least one domain is required'),
    body('domains.*').isLength({ min: 3, max: 253 }),
    body('profileCeiling').optional().isIn(PROFILES),
    body('expiresAt').isISO8601().withMessage('expiresAt must be an ISO 8601 timestamp'),
    body('authorizationReference').optional().isLength({ max: 255 }),
    body('notes').optional().isLength({ max: 2000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { domains, profileCeiling = 'standard', expiresAt, authorizationReference, notes } = req.body;

      if (new Date(expiresAt) <= new Date()) {
        return res.status(400).json({ error: 'expiresAt must be in the future' });
      }

      const response = await axios.post(`${RECON_SERVICE_URL}/api/recon/authorizations`, {
        organizationId: req.params.organizationId,
        domains,
        profileCeiling,
        expiresAt,
        authorizationReference,
        notes,
        authorizedBy: req.user.id,
        authorizedByName: req.user.email || req.user.username || null
      }, { headers: SERVICE_HEADERS(), timeout: 15000 });

      logger.info(
        `User ${req.user.id} recorded a recon authorization for organization ${req.params.organizationId}: `
        + `${domains.join(', ')} up to '${profileCeiling}', expiring ${expiresAt}`
      );

      res.json(response.data);

    } catch (error) {
      logger.error('Error recording recon authorization:', error.message);
      return relayError(res, error, 'Failed to record authorization');
    }
  }
);

router.delete('/authorizations/:organizationId/:authorizationId',
  authenticateToken,
  requireAdminRole(),
  async (req, res) => {
    try {
      const response = await axios.delete(
        `${RECON_SERVICE_URL}/api/recon/authorizations/${req.params.authorizationId}`,
        { headers: SERVICE_HEADERS(), timeout: 15000 }
      );

      logger.info(`User ${req.user.id} revoked recon authorization ${req.params.authorizationId}`);
      res.json(response.data);

    } catch (error) {
      logger.error('Error revoking recon authorization:', error.message);
      return relayError(res, error, 'Failed to revoke authorization');
    }
  }
);

module.exports = router;
