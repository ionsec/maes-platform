const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Alert = sequelize.define('Alert', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    category: {
      type: DataTypes.ENUM(
        'authentication',
        'authorization',
        'data_access',
        'configuration_change',
        'suspicious_activity',
        'malware',
        'policy_violation',
        'system_health',
        'other'
      ),
      defaultValue: 'other'
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
    status: {
      type: DataTypes.ENUM('new', 'acknowledged', 'investigating', 'resolved', 'false_positive'),
      defaultValue: 'new'
    },
    source: {
      type: DataTypes.JSONB,
      defaultValue: {
        extractionId: null,
        analysisJobId: null,
        ruleName: null,
        detectionMethod: null
      }
    },
    affectedEntities: {
      type: DataTypes.JSONB,
      defaultValue: {
        users: [],
        resources: [],
        applications: [],
        ipAddresses: []
      },
      field: 'affected_entities'
    },
    evidence: {
      type: DataTypes.JSONB,
      defaultValue: {
        events: [],
        indicators: [],
        context: {}
      },
      field: 'evidence'
    },
    mitreAttack: {
      type: DataTypes.JSONB,
      defaultValue: {
        tactics: [],
        techniques: [],
        subTechniques: []
      },
      field: 'mitre_attack'
    },
    recommendations: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    acknowledgedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'acknowledged_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'acknowledged_at'
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    resolvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resolved_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at'
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_notes'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'alerts',
    timestamps: true,
    indexes: [
      {
        fields: ['organizationId']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['status']
      },
      {
        fields: ['category']
      },
      {
        fields: ['createdAt']
      },
      {
        fields: ['assignedTo']
      }
    ]
  });

  return Alert;
};