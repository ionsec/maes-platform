const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
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
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [3, 255]
      }
    },
    type: {
      type: DataTypes.ENUM(
        'executive_summary',
        'incident_report',
        'compliance_report',
        'threat_analysis',
        'user_activity',
        'system_health',
        'custom'
      ),
      allowNull: false
    },
    format: {
      type: DataTypes.ENUM('pdf', 'docx', 'xlsx', 'html', 'json'),
      defaultValue: 'pdf'
    },
    status: {
      type: DataTypes.ENUM('pending', 'generating', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    schedule: {
      type: DataTypes.JSONB,
      defaultValue: {
        enabled: false,
        frequency: null, // daily, weekly, monthly
        dayOfWeek: null, // 0-6 for weekly
        dayOfMonth: null, // 1-31 for monthly
        time: null // HH:MM format
      }
    },
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {
        dateRange: {
          start: null,
          end: null
        },
        filters: {},
        includeCharts: true,
        includeRawData: false,
        customSections: []
      }
    },
    sections: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'file_path'
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'file_size'
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'generated_at'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    recipients: {
      type: DataTypes.JSONB,
      defaultValue: {
        emails: [],
        webhooks: []
      }
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'reports',
    timestamps: true,
    indexes: [
      {
        fields: ['organizationId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return Report;
};