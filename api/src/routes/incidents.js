const express = require('express');
const { Incident, User, Organization, Alert, AuditLog } = require('../models');
const { authenticateToken, requirePermission, requireOrganizationAccess } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Generate incident number
const generateIncidentNumber = async (organizationId) => {
  const year = new Date().getFullYear();
  const count = await Incident.count({
    where: { organizationId }
  });
  return `INC-${year}-${(count + 1).toString().padStart(3, '0')}`;
};

// Create new incident
router.post('/', authenticateToken, requirePermission('canCreateIncidents'), async (req, res) => {
  try {
    const {
      title,
      description,
      severity = 'medium',
      priority = 'medium',
      category,
      affectedEntities = {},
      indicators = {},
      assignedTo = null,
      responseTeam = [],
      tags = []
    } = req.body;

    // Validate required fields
    if (!title || !description || !category) {
      return res.status(400).json({ error: 'Title, description, and category are required' });
    }

    // Generate incident number
    const incidentNumber = await generateIncidentNumber(req.organizationId);

    // Create incident
    const incident = await Incident.create({
      incidentNumber,
      title,
      description,
      severity,
      priority,
      category,
      affectedEntities,
      indicators,
      assignedTo,
      responseTeam,
      tags,
      organizationId: req.organizationId,
      msspId: req.msspId,
      clientOrganizationId: req.userType === 'client' ? req.organizationId : null
    });

    // Add initial timeline event
    await incident.addTimelineEvent({
      action: 'incident_created',
      userId: req.user.id,
      description: 'Incident created',
      details: {
        severity,
        priority,
        category
      }
    });

    logger.info(`Created incident: ${incident.incidentNumber} by user: ${req.user.id}`);

    res.status(201).json({
      success: true,
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        category: incident.category,
        assignedTo: incident.assignedTo,
        detectedAt: incident.detectedAt
      }
    });

  } catch (error) {
    logger.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// Get incidents with filtering and pagination
router.get('/', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      severity,
      category,
      assignedTo,
      search,
      startDate,
      endDate,
      organizationId = req.organizationId
    } = req.query;

    // Build where clause
    const whereClause = {};

    // Handle multi-organization access for MSSP users
    if (req.user.isMsspUser() && req.user.hasPermission('canAccessAllClients')) {
      if (req.msspId) {
        whereClause.msspId = req.msspId;
      }
    } else {
      whereClause.organizationId = organizationId;
    }

    if (status) whereClause.status = status;
    if (severity) whereClause.severity = severity;
    if (category) whereClause.category = category;
    if (assignedTo) whereClause.assignedTo = assignedTo;

    // Date range filter
    if (startDate || endDate) {
      whereClause.detectedAt = {};
      if (startDate) whereClause.detectedAt[sequelize.Op.gte] = new Date(startDate);
      if (endDate) whereClause.detectedAt[sequelize.Op.lte] = new Date(endDate);
    }

    // Search filter
    if (search) {
      whereClause[sequelize.Op.or] = [
        { title: { [sequelize.Op.iLike]: `%${search}%` } },
        { description: { [sequelize.Op.iLike]: `%${search}%` } },
        { incidentNumber: { [sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const incidents = await Incident.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'AssignedUser',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Organization,
          as: 'ClientOrganization',
          attributes: ['id', 'name']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['detectedAt', 'DESC']]
    });

    res.json({
      success: true,
      incidents: incidents.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: incidents.count,
        pages: Math.ceil(incidents.count / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to retrieve incidents' });
  }
});

// Get incident by ID
router.get('/:incidentId', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;

    const incident = await Incident.findByPk(incidentId, {
      include: [
        {
          model: User,
          as: 'AssignedUser',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: Organization,
          as: 'ClientOrganization',
          attributes: ['id', 'name', 'organizationType']
        }
      ]
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    res.json({
      success: true,
      incident
    });

  } catch (error) {
    logger.error('Get incident error:', error);
    res.status(500).json({ error: 'Failed to retrieve incident' });
  }
});

// Update incident status
router.patch('/:incidentId/status', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { status, notes } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Update status
    await incident.updateStatus(status, req.user.id);

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'status_updated',
      userId: req.user.id,
      description: `Status changed to ${status}`,
      details: {
        oldStatus: incident.status,
        newStatus: status,
        notes
      }
    });

    logger.info(`Updated incident ${incident.incidentNumber} status to ${status}`);

    res.json({
      success: true,
      message: 'Incident status updated',
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        status: incident.status,
        updatedAt: incident.updatedAt
      }
    });

  } catch (error) {
    logger.error('Update incident status error:', error);
    res.status(500).json({ error: 'Failed to update incident status' });
  }
});

// Assign incident
router.patch('/:incidentId/assign', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { assignedTo, responseTeam = [] } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Validate assigned user
    if (assignedTo) {
      const assignedUser = await User.findByPk(assignedTo);
      if (!assignedUser || !assignedUser.canAccessOrganization(incident.organizationId)) {
        return res.status(400).json({ error: 'Invalid assigned user' });
      }
    }

    // Update assignment
    await incident.update({
      assignedTo,
      responseTeam
    });

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'incident_assigned',
      userId: req.user.id,
      description: `Incident assigned to ${assignedTo ? 'user' : 'unassigned'}`,
      details: {
        assignedTo,
        responseTeam
      }
    });

    logger.info(`Assigned incident ${incident.incidentNumber} to user ${assignedTo}`);

    res.json({
      success: true,
      message: 'Incident assigned successfully',
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        assignedTo: incident.assignedTo,
        responseTeam: incident.responseTeam
      }
    });

  } catch (error) {
    logger.error('Assign incident error:', error);
    res.status(500).json({ error: 'Failed to assign incident' });
  }
});

// Add evidence to incident
router.post('/:incidentId/evidence', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { type, name, description, data, fileUrl } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Add evidence
    const evidence = {
      id: uuidv4(),
      type,
      name,
      description,
      data,
      fileUrl,
      addedBy: req.user.id,
      addedAt: new Date()
    };

    await incident.addEvidence(evidence);

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'evidence_added',
      userId: req.user.id,
      description: `Added evidence: ${name}`,
      details: {
        evidenceType: type,
        evidenceName: name
      }
    });

    logger.info(`Added evidence to incident ${incident.incidentNumber}`);

    res.json({
      success: true,
      message: 'Evidence added successfully',
      evidence
    });

  } catch (error) {
    logger.error('Add evidence error:', error);
    res.status(500).json({ error: 'Failed to add evidence' });
  }
});

// Add indicator to incident
router.post('/:incidentId/indicators', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { type, value, confidence = 'medium', source, notes } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Add indicator
    await incident.addIndicator(type, {
      value,
      confidence,
      source,
      notes,
      addedBy: req.user.id,
      addedAt: new Date()
    });

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'indicator_added',
      userId: req.user.id,
      description: `Added ${type} indicator: ${value}`,
      details: {
        indicatorType: type,
        indicatorValue: value,
        confidence
      }
    });

    logger.info(`Added indicator to incident ${incident.incidentNumber}`);

    res.json({
      success: true,
      message: 'Indicator added successfully'
    });

  } catch (error) {
    logger.error('Add indicator error:', error);
    res.status(500).json({ error: 'Failed to add indicator' });
  }
});

// Escalate incident
router.post('/:incidentId/escalate', authenticateToken, requirePermission('canEscalateIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { reason, escalationLevel, notifyUsers = [] } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Update escalation
    const newEscalationLevel = Math.min(incident.escalationLevel + 1, 5);
    await incident.update({
      status: 'escalated',
      escalationLevel: newEscalationLevel
    });

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'incident_escalated',
      userId: req.user.id,
      description: `Incident escalated to level ${newEscalationLevel}`,
      details: {
        reason,
        escalationLevel: newEscalationLevel,
        notifyUsers
      }
    });

    logger.info(`Escalated incident ${incident.incidentNumber} to level ${newEscalationLevel}`);

    res.json({
      success: true,
      message: 'Incident escalated successfully',
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        status: incident.status,
        escalationLevel: incident.escalationLevel
      }
    });

  } catch (error) {
    logger.error('Escalate incident error:', error);
    res.status(500).json({ error: 'Failed to escalate incident' });
  }
});

// Add communication to incident
router.post('/:incidentId/communications', authenticateToken, requirePermission('canManageIncidents'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { type, subject, content, recipients = [], internal = false } = req.body;

    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check access permissions
    if (!req.user.canAccessOrganization(incident.organizationId)) {
      return res.status(403).json({ error: 'Access denied to this incident' });
    }

    // Add communication
    const communication = {
      id: uuidv4(),
      type,
      subject,
      content,
      recipients,
      internal,
      sentBy: req.user.id,
      sentAt: new Date()
    };

    incident.communications.push(communication);
    await incident.save();

    // Add timeline event
    await incident.addTimelineEvent({
      action: 'communication_added',
      userId: req.user.id,
      description: `Added ${type} communication: ${subject}`,
      details: {
        communicationType: type,
        subject,
        internal
      }
    });

    logger.info(`Added communication to incident ${incident.incidentNumber}`);

    res.json({
      success: true,
      message: 'Communication added successfully',
      communication
    });

  } catch (error) {
    logger.error('Add communication error:', error);
    res.status(500).json({ error: 'Failed to add communication' });
  }
});

// Get incident statistics
router.get('/stats/overview', authenticateToken, requirePermission('canViewReports'), async (req, res) => {
  try {
    const { organizationId = req.organizationId, startDate, endDate } = req.query;

    // Build where clause
    const whereClause = { organizationId };

    if (startDate || endDate) {
      whereClause.detectedAt = {};
      if (startDate) whereClause.detectedAt[sequelize.Op.gte] = new Date(startDate);
      if (endDate) whereClause.detectedAt[sequelize.Op.lte] = new Date(endDate);
    }

    const [
      totalIncidents,
      activeIncidents,
      resolvedIncidents,
      escalatedIncidents,
      incidentsBySeverity,
      incidentsByCategory,
      incidentsByStatus
    ] = await Promise.all([
      Incident.count({ where: whereClause }),
      Incident.count({ where: { ...whereClause, status: ['new', 'acknowledged', 'investigating', 'contained', 'escalated'] } }),
      Incident.count({ where: { ...whereClause, status: ['resolved', 'closed'] } }),
      Incident.count({ where: { ...whereClause, status: 'escalated' } }),
      Incident.findAll({
        where: whereClause,
        attributes: ['severity', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['severity']
      }),
      Incident.findAll({
        where: whereClause,
        attributes: ['category', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['category']
      }),
      Incident.findAll({
        where: whereClause,
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status']
      })
    ]);

    res.json({
      success: true,
      stats: {
        total: totalIncidents,
        active: activeIncidents,
        resolved: resolvedIncidents,
        escalated: escalatedIncidents,
        bySeverity: incidentsBySeverity,
        byCategory: incidentsByCategory,
        byStatus: incidentsByStatus
      }
    });

  } catch (error) {
    logger.error('Get incident stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve incident statistics' });
  }
});

module.exports = router; 