const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
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
    action: {
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
        'data_modification',
        'configuration',
        'system',
        'api_call'
      ),
      allowNull: false
    },
    resource: {
      type: DataTypes.STRING,
      allowNull: true
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'resource_id'
    },
    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    requestMethod: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'request_method'
    },
    requestPath: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'request_path'
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status_code'
    },
    duration: {
      type: DataTypes.INTEGER, // milliseconds
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false, // Audit logs should not be updated
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['organizationId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['category']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return AuditLog;
};