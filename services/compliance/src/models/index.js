const { Sequelize } = require('sequelize');
const { logger } = require('../logger');

// Database connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Define models
const Organization = sequelize.define('Organization', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  tenant_id: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  fqdn: {
    type: Sequelize.STRING
  },
  credentials: {
    type: Sequelize.JSONB,
    defaultValue: {}
  },
  is_active: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'organizations',
  schema: 'maes'
});

const User = sequelize.define('User', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  email: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  username: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  role: {
    type: Sequelize.ENUM('admin', 'analyst', 'viewer'),
    defaultValue: 'analyst'
  },
  is_active: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'users',
  schema: 'maes'
});

const ComplianceAssessment = sequelize.define('ComplianceAssessment', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  organization_id: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: Organization,
      key: 'id'
    }
  },
  assessment_type: {
    type: Sequelize.ENUM('cis_v400', 'cis_v300', 'custom', 'orca_style'),
    defaultValue: 'cis_v400'
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  description: {
    type: Sequelize.TEXT
  },
  status: {
    type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  progress: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  total_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  compliant_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  non_compliant_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  manual_review_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  not_applicable_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  error_controls: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  compliance_score: {
    type: Sequelize.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  weighted_score: {
    type: Sequelize.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  started_at: {
    type: Sequelize.DATE
  },
  completed_at: {
    type: Sequelize.DATE
  },
  duration: {
    type: Sequelize.INTEGER
  },
  error_message: {
    type: Sequelize.TEXT
  },
  error_details: {
    type: Sequelize.JSONB
  },
  metadata: {
    type: Sequelize.JSONB,
    defaultValue: {}
  },
  parameters: {
    type: Sequelize.JSONB,
    defaultValue: {}
  },
  triggered_by: {
    type: Sequelize.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  is_scheduled: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  },
  is_baseline: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  },
  parent_schedule_id: {
    type: Sequelize.UUID
  }
}, {
  tableName: 'compliance_assessments',
  schema: 'maes'
});

const ComplianceControl = sequelize.define('ComplianceControl', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  assessment_type: {
    type: Sequelize.ENUM('cis_v400', 'cis_v300', 'custom', 'orca_style'),
    defaultValue: 'cis_v400'
  },
  control_id: {
    type: Sequelize.STRING(50),
    allowNull: false
  },
  section: {
    type: Sequelize.STRING(100),
    allowNull: false
  },
  title: {
    type: Sequelize.STRING(500),
    allowNull: false
  },
  description: {
    type: Sequelize.TEXT,
    allowNull: false
  },
  rationale: {
    type: Sequelize.TEXT
  },
  impact: {
    type: Sequelize.TEXT
  },
  remediation: {
    type: Sequelize.TEXT
  },
  severity: {
    type: Sequelize.ENUM('level1', 'level2'),
    defaultValue: 'level1'
  },
  weight: {
    type: Sequelize.DECIMAL(3, 2),
    defaultValue: 1.00,
    validate: {
      min: 0.01
    }
  },
  graph_api_endpoint: {
    type: Sequelize.TEXT
  },
  check_method: {
    type: Sequelize.TEXT
  },
  expected_result: {
    type: Sequelize.JSONB
  },
  is_active: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  },
  metadata: {
    type: Sequelize.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'compliance_controls',
  schema: 'maes',
  indexes: [
    {
      unique: true,
      fields: ['assessment_type', 'control_id']
    }
  ]
});

const ComplianceResult = sequelize.define('ComplianceResult', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  assessment_id: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: ComplianceAssessment,
      key: 'id'
    }
  },
  control_id: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: ComplianceControl,
      key: 'id'
    }
  },
  status: {
    type: Sequelize.ENUM('compliant', 'non_compliant', 'manual_review', 'not_applicable', 'error'),
    allowNull: false
  },
  score: {
    type: Sequelize.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  actual_result: {
    type: Sequelize.JSONB
  },
  expected_result: {
    type: Sequelize.JSONB
  },
  evidence: {
    type: Sequelize.JSONB
  },
  remediation_guidance: {
    type: Sequelize.TEXT
  },
  error_message: {
    type: Sequelize.TEXT
  },
  error_details: {
    type: Sequelize.JSONB
  },
  checked_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  },
  metadata: {
    type: Sequelize.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'compliance_results',
  schema: 'maes',
  createdAt: 'created_at',
  updatedAt: false
});

const ComplianceSchedule = sequelize.define('ComplianceSchedule', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  organization_id: {
    type: Sequelize.UUID,
    allowNull: false,
    references: {
      model: Organization,
      key: 'id'
    }
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  description: {
    type: Sequelize.TEXT
  },
  assessment_type: {
    type: Sequelize.ENUM('cis_v400', 'cis_v300', 'custom', 'orca_style'),
    defaultValue: 'cis_v400'
  },
  frequency: {
    type: Sequelize.ENUM('daily', 'weekly', 'monthly', 'quarterly'),
    allowNull: false
  },
  is_active: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  },
  next_run_at: {
    type: Sequelize.DATE
  },
  last_run_at: {
    type: Sequelize.DATE
  },
  last_assessment_id: {
    type: Sequelize.UUID,
    references: {
      model: ComplianceAssessment,
      key: 'id'
    }
  },
  parameters: {
    type: Sequelize.JSONB,
    defaultValue: {}
  },
  created_by: {
    type: Sequelize.UUID,
    references: {
      model: User,
      key: 'id'
    }
  }
}, {
  tableName: 'compliance_schedules',
  schema: 'maes'
});

// Define associations
Organization.hasMany(ComplianceAssessment, { foreignKey: 'organization_id', as: 'assessments' });
ComplianceAssessment.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

User.hasMany(ComplianceAssessment, { foreignKey: 'triggered_by', as: 'triggeredAssessments' });
ComplianceAssessment.belongsTo(User, { foreignKey: 'triggered_by', as: 'triggeredByUser' });

ComplianceAssessment.hasMany(ComplianceResult, { foreignKey: 'assessment_id', as: 'results' });
ComplianceResult.belongsTo(ComplianceAssessment, { foreignKey: 'assessment_id', as: 'assessment' });

ComplianceControl.hasMany(ComplianceResult, { foreignKey: 'control_id', as: 'results' });
ComplianceResult.belongsTo(ComplianceControl, { foreignKey: 'control_id', as: 'control' });

Organization.hasMany(ComplianceSchedule, { foreignKey: 'organization_id', as: 'schedules' });
ComplianceSchedule.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

User.hasMany(ComplianceSchedule, { foreignKey: 'created_by', as: 'createdSchedules' });
ComplianceSchedule.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

ComplianceAssessment.hasMany(ComplianceSchedule, { foreignKey: 'last_assessment_id', as: 'schedules' });
ComplianceSchedule.belongsTo(ComplianceAssessment, { foreignKey: 'last_assessment_id', as: 'lastAssessment' });

module.exports = {
  sequelize,
  Organization,
  User,
  ComplianceAssessment,
  ComplianceControl,
  ComplianceResult,
  ComplianceSchedule
};