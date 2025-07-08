const { Sequelize } = require('sequelize');
const { logger } = require('../utils/logger');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  schema: 'maes',
  define: {
    timestamps: true,
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

// Import models
const Organization = require('./Organization')(sequelize);
const User = require('./User')(sequelize);
const Extraction = require('./Extraction')(sequelize);
const AnalysisJob = require('./AnalysisJob')(sequelize);
const Alert = require('./Alert')(sequelize);
const Report = require('./Report')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);

// Define associations

// Organization associations
Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });

Organization.hasMany(Extraction, { foreignKey: 'organizationId' });
Extraction.belongsTo(Organization, { foreignKey: 'organizationId' });

User.hasMany(Extraction, { foreignKey: 'triggeredBy' });
Extraction.belongsTo(User, { foreignKey: 'triggeredBy', as: 'triggeredByUser' });

Organization.hasMany(Alert, { foreignKey: 'organizationId' });
Alert.belongsTo(Organization, { foreignKey: 'organizationId' });

User.hasMany(Alert, { foreignKey: 'acknowledgedBy' });
Alert.belongsTo(User, { foreignKey: 'acknowledgedBy', as: 'acknowledgedByUser' });

User.hasMany(Alert, { foreignKey: 'assignedTo' });
Alert.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignedToUser' });

User.hasMany(Alert, { foreignKey: 'resolvedBy' });
Alert.belongsTo(User, { foreignKey: 'resolvedBy', as: 'resolvedByUser' });

Organization.hasMany(Report, { foreignKey: 'organizationId' });
Report.belongsTo(Organization, { foreignKey: 'organizationId' });

User.hasMany(Report, { foreignKey: 'createdBy' });
Report.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Organization.hasMany(AuditLog, { foreignKey: 'organizationId' });
AuditLog.belongsTo(Organization, { foreignKey: 'organizationId' });



// User associations
User.hasMany(AuditLog, { foreignKey: 'userId' });
AuditLog.belongsTo(User, { foreignKey: 'userId' });

// Extraction and Analysis associations
Extraction.hasMany(AnalysisJob, { foreignKey: 'extractionId' });
AnalysisJob.belongsTo(Extraction, { foreignKey: 'extractionId' });

Organization.hasMany(AnalysisJob, { foreignKey: 'organizationId' });
AnalysisJob.belongsTo(Organization, { foreignKey: 'organizationId' });



// Add organizationId to models that need it
if (!Extraction.rawAttributes.organizationId) {
  Extraction.rawAttributes.organizationId = {
    type: sequelize.Sequelize.UUID,
    allowNull: false,
    references: {
      model: 'organizations',
      key: 'id'
    }
  };
}

// AnalysisJob organizationId is now defined in the model



module.exports = {
  sequelize,
  Organization,
  User,
  Extraction,
  AnalysisJob,
  Alert,
  Report,
  AuditLog,

};