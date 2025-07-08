const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Extraction = sequelize.define('Extraction', {
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
    type: {
      type: DataTypes.ENUM(
        'unified_audit_log',
        'azure_signin_logs',
        'azure_audit_logs',
        'mailbox_audit',
        'message_trace',
        'emails',
        'oauth_permissions',
        'mfa_status',
        'risky_users',
        'risky_detections',
        'devices',
        'full_extraction'
      ),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium'
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date'
    },
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
    },
    itemsExtracted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'items_extracted'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    duration: {
      type: DataTypes.INTEGER, // Duration in seconds
      allowNull: true
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    },
    errorDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'error_details'
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'retry_count'
    },
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {
        includeDeleted: false,
        filterUsers: [],
        filterOperations: [],
        customFilters: {}
      }
    },
    outputFiles: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'output_files'
    },
    statistics: {
      type: DataTypes.JSONB,
      defaultValue: {
        totalEvents: 0,
        uniqueUsers: 0,
        uniqueOperations: 0,
        errorCount: 0,
        warningCount: 0
      },
      field: 'statistics'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    triggeredBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'triggered_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    isScheduled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_scheduled'
    }
  }, {
    tableName: 'extractions',
    timestamps: true,
    indexes: [
      {
        fields: ['organizationId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['type']
      },
      {
        fields: ['startDate', 'endDate']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  // Hooks
  Extraction.beforeUpdate((extraction, options) => {
    if (extraction.status === 'completed' && extraction.startedAt) {
      extraction.duration = Math.floor((new Date() - extraction.startedAt) / 1000);
    }
  });

  return Extraction;
};