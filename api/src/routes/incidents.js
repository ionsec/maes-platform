const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const IncidentService = require('../services/caseManagement/incidentService');
const PlaybookEngine = require('../services/playbooks/playbookEngine');

const router = express.Router();

router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * List incidents
 */
router.get('/', 
  requirePermission('canManageIncidents'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['new', 'investigating', 'contained', 'resolved', 'closed']),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.severity) filters.severity = req.query.severity;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await IncidentService.listIncidents(req.organizationId, filters, page, limit);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Error listing incidents:', error);
      res.status(500).json({ error: 'Failed to list incidents' });
    }
  }
);

/**
 * Get incident statistics - must be before /:id route
 */
router.get('/stats/summary', 
  requirePermission('canManageIncidents'),
  async (req, res) => {
    try {
      const stats = await IncidentService.getStatistics(req.organizationId);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Error getting incident statistics:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  }
);

/**
 * List available playbooks - must be before /:id route
 */
router.get('/meta/playbooks', 
  requirePermission('canManageSystemSettings'),
  async (req, res) => {
    const playbooks = Array.from(PlaybookEngine.playbooks.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      version: p.version,
      triggers: p.triggers,
      severity_threshold: p.severity_threshold,
      steps: p.steps.map(s => ({ id: s.id, name: s.name, type: s.type }))
    }));

    res.json({
      success: true,
      playbooks
    });
  }
);

/**
 * Get incident by ID
 */
router.get('/:id', 
  requirePermission('canManageIncidents'),
  async (req, res) => {
    try {
      const incident = await IncidentService.getIncident(req.params.id, req.organizationId);

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      res.json({
        success: true,
        incident
      });
    } catch (error) {
      logger.error('Error getting incident:', error);
      res.status(500).json({ error: 'Failed to get incident' });
    }
  }
);

/**
 * Create incident from alerts
 */
router.post('/', 
  requirePermission('canManageIncidents'),
  [
    body('title').isString().isLength({ min: 1 }).withMessage('Title is required'),
    body('description').isString().withMessage('Description is required'),
    body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    body('alertIds').optional().isArray().withMessage('alertIds must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const incident = await IncidentService.createIncident({
        ...req.body,
        organizationId: req.organizationId
      });

      res.status(201).json({
        success: true,
        incident
      });
    } catch (error) {
      logger.error('Error creating incident:', error);
      res.status(500).json({ error: 'Failed to create incident' });
    }
  }
);

/**
 * Update incident status
 */
router.put('/:id/status', 
  requirePermission('canManageIncidents'),
  [
    body('status').isIn(['new', 'investigating', 'contained', 'resolved', 'closed']).withMessage('Invalid status'),
    body('notes').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const incident = await IncidentService.updateStatus(
        req.params.id,
        req.organizationId,
        req.body.status,
        req.user.id,
        req.body.notes
      );

      res.json({
        success: true,
        incident
      });
    } catch (error) {
      logger.error('Error updating incident status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

/**
 * Assign incident
 */
router.put('/:id/assign', 
  requirePermission('canManageIncidents'),
  [
    body('assignedTo').isUUID().withMessage('Valid user ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const incident = await IncidentService.assignIncident(
        req.params.id,
        req.organizationId,
        req.body.assignedTo,
        req.user.id
      );

      res.json({
        success: true,
        incident
      });
    } catch (error) {
      logger.error('Error assigning incident:', error);
      res.status(500).json({ error: 'Failed to assign incident' });
    }
  }
);

/**
 * Add evidence to incident
 */
router.post('/:id/evidence', 
  requirePermission('canManageIncidents'),
  [
    body('type').isString().withMessage('Evidence type is required'),
    body('name').isString().withMessage('Evidence name is required'),
    body('description').optional().isString(),
    body('hash').optional().isString(),
    body('storagePath').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const evidence = await IncidentService.addEvidence(req.params.id, req.organizationId, req.body);

      res.status(201).json({
        success: true,
        evidence
      });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      res.status(500).json({ error: 'Failed to add evidence' });
    }
  }
);

/**
 * Execute playbook on incident
 */
router.post('/:id/playbook', 
  requirePermission('canManageIncidents'),
  [
    body('playbookId').isString().withMessage('Playbook ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const incident = await IncidentService.getIncident(req.params.id, req.organizationId);
      
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const execution = await PlaybookEngine.executePlaybook(req.body.playbookId, {
        incidentId: req.params.id,
        organizationId: req.organizationId,
        alertIds: incident.alert_ids
      });

      res.json({
        success: true,
        execution
      });
    } catch (error) {
      logger.error('Error executing playbook:', error);
      res.status(500).json({ error: 'Failed to execute playbook' });
    }
  }
);

module.exports = router;
