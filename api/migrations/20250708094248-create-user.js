'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      email: {
        type: Sequelize.STRING
      },
      username: {
        type: Sequelize.STRING
      },
      password: {
        type: Sequelize.STRING
      },
      firstName: {
        type: Sequelize.STRING
      },
      lastName: {
        type: Sequelize.STRING
      },
      role: {
        type: Sequelize.STRING
      },
      permissions: {
        type: Sequelize.JSONB
      },
      mfaEnabled: {
        type: Sequelize.BOOLEAN
      },
      mfaSecret: {
        type: Sequelize.STRING
      },
      isActive: {
        type: Sequelize.BOOLEAN
      },
      lastLogin: {
        type: Sequelize.DATE
      },
      loginAttempts: {
        type: Sequelize.INTEGER
      },
      lockedUntil: {
        type: Sequelize.DATE
      },
      preferences: {
        type: Sequelize.JSONB
      },
      organizationId: {
        type: Sequelize.UUID
      },
      msspId: {
        type: Sequelize.UUID
      },
      userType: {
        type: Sequelize.STRING
      },
      specialization: {
        type: Sequelize.JSONB
      },
      accessibleOrganizations: {
        type: Sequelize.JSONB
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Users');
  }
};