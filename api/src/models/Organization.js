const { DataTypes } = require('sequelize');
const EncryptionUtil = require('../utils/encryption');

module.exports = (sequelize) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 255]
      }
    },
    tenantId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      field: 'tenant_id',
      validate: {
        notEmpty: true
      }
    },
    subscriptionId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'subscription_id'
    },
    organizationType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'standalone',
      field: 'organization_type',
      validate: {
        isIn: [['mssp', 'client', 'standalone']]
      }
    },
    subscriptionStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active',
      field: 'subscription_status',
      validate: {
        isIn: [['active', 'inactive', 'trial', 'expired']]
      }
    },
    serviceTier: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'basic',
      field: 'service_tier',
      validate: {
        isIn: [['basic', 'premium', 'enterprise']]
      }
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        extractionSchedule: {
          enabled: false,
          interval: 'daily',
          time: '02:00'
        },
        analysisSettings: {
          autoAnalyze: true,
          enableThreatIntel: false,
          enableMachineLearning: false,
          enableRealTimeMonitoring: false
        },
        alertingSettings: {
          emailNotifications: true,
          webhookUrl: null,
          severityThreshold: 'medium',
          escalationEnabled: false
        },
        retentionDays: 90,
        dataProcessing: {
          enableAnonymization: false,
          enableEncryption: true,
          enableCompression: true
        }
      }
    },
    credentials: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        // Decrypt credentials when retrieving
        const encrypted = this.getDataValue('credentials');
        return EncryptionUtil.decryptCredentials(encrypted);
      },
      set(value) {
        // Encrypt credentials before storing
        const encrypted = EncryptionUtil.encryptCredentials(value);
        this.setDataValue('credentials', encrypted);
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'organizations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['tenantId']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  // Instance methods
  Organization.prototype.hasActiveSubscription = function() {
    return this.isActive && 
           this.subscriptionStatus && 
           ['active', 'trial'].includes(this.subscriptionStatus);
  };

  // Class methods
  Organization.getSubscriptionStatus = function(subscriptionStatus) {
    const statusMap = {
      'active': 'Active',
      'inactive': 'Inactive', 
      'trial': 'Trial',
      'expired': 'Expired'
    };
    return statusMap[subscriptionStatus] || 'Unknown';
  };

  return Organization;
};