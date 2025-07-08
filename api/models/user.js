'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  User.init({
    email: DataTypes.STRING,
    username: DataTypes.STRING,
    password: DataTypes.STRING,
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    role: DataTypes.STRING,
    permissions: DataTypes.JSONB,
    mfaEnabled: DataTypes.BOOLEAN,
    mfaSecret: DataTypes.STRING,
    isActive: DataTypes.BOOLEAN,
    lastLogin: DataTypes.DATE,
    loginAttempts: DataTypes.INTEGER,
    lockedUntil: DataTypes.DATE,
    preferences: DataTypes.JSONB,
    organizationId: DataTypes.UUID,
    msspId: DataTypes.UUID,
    userType: DataTypes.STRING,
    specialization: DataTypes.JSONB,
    accessibleOrganizations: DataTypes.JSONB
  }, {
    sequelize,
    modelName: 'User',
  });
  return User;
};