const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Incident = sequelize.define('Incident', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incidentNumber: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      comment: 'Human-readable incident number (e.g., INC-2024-001)'
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [5, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'medium'
    },
    status: {
      type: DataTypes.ENUM(
        'new',
        'acknowledged',
        'investigating',
        'contained',
        'resolved',
        'closed',
        'escalated'
      ),
      defaultValue: 'new',
      allowNull: false
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM(
        'malware',
        'phishing',
        'data_breach',
        'unauthorized_access',
        'privilege_escalation',
        'data_exfiltration',
        'denial_of_service',
        'insider_threat',
        'compliance_violation',
        'other'
      ),
      allowNull: false
    },
    // MSSP-specific fields
    msspId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    clientOrganizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    // Incident details
    affectedEntities: {
      type: DataTypes.JSONB,
      defaultValue: {
        users: [],
        systems: [],
        data: [],
        applications: [],
        networks: []
      }
    },
    indicators: {
      type: DataTypes.JSONB,
      defaultValue: {
        iocs: [], // Indicators of Compromise
        ips: [],
        domains: [],
        hashes: [],
        urls: []
      }
    },
    timeline: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of timeline events'
    },
    evidence: {
      type: DataTypes.JSONB,
      defaultValue: {
        artifacts: [],
        logs: [],
        screenshots: [],
        reports: []
      }
    },
    mitreAttack: {
      type: DataTypes.JSONB,
      defaultValue: {
        tactics: [],
        techniques: [],
        subTechniques: []
      }
    },
    // Response management
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    responseTeam: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of user IDs assigned to this incident'
    },
    escalationLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 5
      }
    },
    slaTarget: {
      type: DataTypes.DATE,
      allowNull: true
    },
    slaBreached: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    // Timestamps
    detectedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    containedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Communication
    notifications: {
      type: DataTypes.JSONB,
      defaultValue: {
        sent: [],
        pending: [],
        failed: []
      }
    },
    communications: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of communication logs'
    },
    // Related entities
    relatedAlerts: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of alert IDs related to this incident'
    },
    relatedExtractions: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of extraction IDs related to this incident'
    },
    relatedAnalysisJobs: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of analysis job IDs related to this incident'
    },
    // Resolution
    rootCause: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resolution: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    lessonsLearned: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    recommendations: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    // Metadata
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'incidents',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['incidentNumber']
      },
      {
        fields: ['organizationId']
      },
      {
        fields: ['msspId']
      },
      {
        fields: ['clientOrganizationId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['category']
      },
      {
        fields: ['assignedTo']
      },
      {
        fields: ['detectedAt']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  // Instance methods
  Incident.prototype.isActive = function() {
    return ['new', 'acknowledged', 'investigating', 'contained', 'escalated'].includes(this.status);
  };

  Incident.prototype.isResolved = function() {
    return ['resolved', 'closed'].includes(this.status);
  };

  Incident.prototype.isEscalated = function() {
    return this.status === 'escalated' || this.escalationLevel > 0;
  };

  Incident.prototype.updateStatus = async function(newStatus, userId) {
    const oldStatus = this.status;
    this.status = newStatus;
    
    // Update timestamps based on status
    switch (newStatus) {
      case 'acknowledged':
        this.acknowledgedAt = new Date();
        break;
      case 'contained':
        this.containedAt = new Date();
        break;
      case 'resolved':
        this.resolvedAt = new Date();
        break;
      case 'closed':
        this.closedAt = new Date();
        break;
    }
    
    // Add to timeline
    this.timeline.push({
      timestamp: new Date(),
      action: 'status_changed',
      userId: userId,
      oldStatus: oldStatus,
      newStatus: newStatus
    });
    
    await this.save();
  };

  Incident.prototype.addTimelineEvent = async function(event) {
    this.timeline.push({
      timestamp: new Date(),
      ...event
    });
    await this.save();
  };

  Incident.prototype.addEvidence = async function(evidence) {
    this.evidence.artifacts.push(evidence);
    await this.save();
  };

  Incident.prototype.addIndicator = async function(type, value) {
    if (!this.indicators[type]) {
      this.indicators[type] = [];
    }
    this.indicators[type].push(value);
    await this.save();
  };

  return Incident;
}; 