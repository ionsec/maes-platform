const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AnalysisJob = sequelize.define('AnalysisJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    extractionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'extraction_id',
      references: {
        model: 'extractions',
        key: 'id'
      }
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM(
        'ual_analysis',
        'signin_analysis',
        'audit_analysis',
        'mfa_analysis',
        'oauth_analysis',
        'risky_detection_analysis',
        'risky_user_analysis',
        'message_trace_analysis',
        'device_analysis',
        'comprehensive_analysis'
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
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
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
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {
        enableThreatIntel: true,
        enablePatternDetection: true,
        enableAnomalyDetection: false,
        customRules: []
      }
    },
    results: {
      type: DataTypes.JSONB,
      defaultValue: {
        summary: {},
        findings: [],
        statistics: {},
        recommendations: []
      }
    },
    alerts: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    outputFiles: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'output_files'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'analysis_jobs',
    timestamps: true,
    indexes: [
      {
        fields: ['extractionId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['type']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  // Hooks
  AnalysisJob.beforeUpdate((job, options) => {
    if (job.status === 'completed' && job.startedAt) {
      job.duration = Math.floor((new Date() - job.startedAt) / 1000);
    }
  });

  return AnalysisJob;
};