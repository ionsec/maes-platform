const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        isAlphanumeric: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        const hash = bcrypt.hashSync(value, 10);
        this.setDataValue('password', hash);
      }
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'last_name'
    },
    // Enhanced role system for MSSP
    role: {
      type: DataTypes.ENUM(
        'super_admin',      // Platform admin (MSSP level)
        'mssp_admin',       // MSSP organization admin
        'mssp_analyst',     // MSSP security analyst
        'mssp_responder',   // MSSP incident responder
        'client_admin',     // Client organization admin
        'client_analyst',   // Client security analyst
        'client_viewer',    // Client read-only user
        'standalone_admin', // Standalone organization admin
        'standalone_analyst', // Standalone analyst
        'standalone_viewer'   // Standalone viewer
      ),
      defaultValue: 'standalone_analyst'
    },
    // Organization association
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    // Enhanced permissions system
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: {
        // Data Management
        canManageExtractions: false,
        canRunAnalysis: true,
        canViewReports: true,
        canManageAlerts: true,
        canManageUsers: false,
        canManageOrganization: false,
        
        // MSSP-specific permissions
        canManageClients: false,
        canAccessAllClients: false,
        canManageMsspSettings: false,
        canViewBilling: false,
        canManageSubscriptions: false,
        
        // Incident Response
        canCreateIncidents: false,
        canManageIncidents: true,
        canEscalateIncidents: false,
        canCloseIncidents: false,
        
        // Advanced Features
        canUseAdvancedAnalytics: false,
        canAccessThreatIntel: false,
        canManageIntegrations: false,
        canExportData: true,
        
        // System Administration
        canViewAuditLogs: false,
        canManageSystemSettings: false,
        canAccessApi: false
      }
    },

    mfaEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'mfa_enabled'
    },
    mfaSecret: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'mfa_secret'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login'
    },
    loginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'login_attempts'
    },
    lockedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'locked_until'
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        theme: 'light',
        timezone: 'UTC',
        notifications: {
          email: true,
          inApp: true,
          sms: false,
          slack: false
        },
        dashboard: {
          defaultView: 'overview',
          refreshInterval: 30,
          showAlerts: true,
          showIncidents: true
        }
      }
    }
  }, {
    tableName: 'users',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['email']
      },
      {
        unique: true,
        fields: ['username']
      },
      {
        fields: ['organizationId']
      },
      {
        fields: ['role']
      },
      {
        fields: ['isActive']
      }
    ],
    defaultScope: {
      attributes: { exclude: ['password', 'mfaSecret'] }
    },
    scopes: {
      withPassword: {
        attributes: { include: ['password'] }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.hasPermission = function(permission) {
    return this.permissions[permission] === true;
  };

  User.prototype.isLocked = function() {
    return this.lockedUntil && this.lockedUntil > new Date();
  };



  User.prototype.hasRole = function(role) {
    return this.role === role;
  };

  User.prototype.hasAnyRole = function(roles) {
    return roles.includes(this.role);
  };

  User.prototype.isAdmin = function() {
    return ['super_admin', 'mssp_admin', 'client_admin', 'standalone_admin'].includes(this.role);
  };

  User.prototype.isAnalyst = function() {
    return ['mssp_analyst', 'mssp_responder', 'client_analyst', 'standalone_analyst'].includes(this.role);
  };

  return User;
};