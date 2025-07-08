const { Sequelize } = require('sequelize');

// Database connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  schema: 'maes',
  searchPath: ['maes', 'public']
});

// Define basic models for analyzer service
const Extraction = sequelize.define('Extraction', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true,
    defaultValue: Sequelize.UUIDV4
  },
  organizationId: {
    type: Sequelize.UUID,
    allowNull: false,
    field: 'organization_id'
  },
  type: {
    type: Sequelize.STRING,
    allowNull: false
  },
  status: {
    type: Sequelize.STRING,
    defaultValue: 'pending'
  },
  progress: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  outputFiles: {
    type: Sequelize.JSONB,
    defaultValue: [],
    field: 'output_files'
  }
}, {
  tableName: 'extractions',
  schema: 'maes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const AnalysisJob = sequelize.define('AnalysisJob', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true,
    defaultValue: Sequelize.UUIDV4
  },
  extractionId: {
    type: Sequelize.UUID,
    allowNull: false,
    field: 'extraction_id'
  },
  type: {
    type: Sequelize.STRING,
    allowNull: false
  },
  status: {
    type: Sequelize.STRING,
    defaultValue: 'pending'
  },
  progress: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  results: {
    type: Sequelize.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'analysis_jobs',
  schema: 'maes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const Alert = sequelize.define('Alert', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true,
    defaultValue: Sequelize.UUIDV4
  },
  organizationId: {
    type: Sequelize.UUID,
    allowNull: false,
    field: 'organization_id'
  },
  severity: {
    type: Sequelize.STRING,
    allowNull: false
  },
  type: {
    type: Sequelize.STRING,
    allowNull: false
  },
  title: {
    type: Sequelize.STRING,
    allowNull: false
  },
  description: {
    type: Sequelize.TEXT,
    allowNull: false
  },
  status: {
    type: Sequelize.STRING,
    defaultValue: 'new'
  }
}, {
  tableName: 'alerts',
  schema: 'maes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const Organization = sequelize.define('Organization', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true,
    defaultValue: Sequelize.UUIDV4
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  tenantId: {
    type: Sequelize.STRING,
    allowNull: false,
    field: 'tenant_id'
  }
}, {
  tableName: 'organizations',
  schema: 'maes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const User = sequelize.define('User', {
  id: {
    type: Sequelize.UUID,
    primaryKey: true,
    defaultValue: Sequelize.UUIDV4
  },
  organizationId: {
    type: Sequelize.UUID,
    allowNull: false,
    field: 'organization_id'
  },
  email: {
    type: Sequelize.STRING,
    allowNull: false
  },
  username: {
    type: Sequelize.STRING,
    allowNull: false
  },
  role: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
  tableName: 'users',
  schema: 'maes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Define associations
Extraction.belongsTo(Organization, { foreignKey: 'organizationId' });
AnalysisJob.belongsTo(Extraction, { foreignKey: 'extractionId' });
Alert.belongsTo(Organization, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });

module.exports = {
  sequelize,
  User,
  Organization,
  Extraction,
  AnalysisJob,
  Alert
}; 