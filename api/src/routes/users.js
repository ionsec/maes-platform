const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Organization, AuditLog } = require('../services/models');
const { authenticateToken, requirePermission, requireSuperAdmin } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { pool } = require('../services/database');

const router = express.Router();

// Get all organizations (for super admin user management)
router.get('/organizations/all', authenticateToken, requireSuperAdmin(), async (req, res) => {
  try {
    const organizationsQuery = `
      SELECT id, name, organization_type, is_active, created_at
      FROM maes.organizations
      ORDER BY name ASC
    `;
    
    const result = await pool.query(organizationsQuery);
    
    res.json({
      success: true,
      organizations: result.rows.map(org => ({
        id: org.id,
        name: org.name,
        organizationType: org.organization_type,
        isActive: org.is_active,
        createdAt: org.created_at
      }))
    });
  } catch (error) {
    logger.error('Get all organizations error:', error);
    res.status(500).json({ error: 'Failed to retrieve organizations' });
  }
});

// Get users for organization
router.get('/', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  
  try {
    const { page = 1, limit = 20, role, search, isActive, allOrganizations } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Super admins can see users from all organizations if requested
    const isSuperAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    
    if (!allOrganizations || !isSuperAdmin) {
      // Regular filter by organization
      paramCount++;
      whereConditions.push(`u.organization_id = $${paramCount}`);
      queryParams.push(req.organizationId);
    }

    if (role) {
      paramCount++;
      whereConditions.push(`u.role = $${paramCount}`);
      queryParams.push(role);
    }

    if (isActive !== undefined) {
      paramCount++;
      whereConditions.push(`u.is_active = $${paramCount}`);
      queryParams.push(isActive === 'true');
    }

    if (search) {
      paramCount++;
      whereConditions.push(`(
        u.first_name ILIKE $${paramCount} OR 
        u.last_name ILIKE $${paramCount} OR 
        u.email ILIKE $${paramCount} OR 
        u.username ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? whereConditions.join(' AND ') : '1=1';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM maes.users u 
      ${whereConditions.length > 0 ? `WHERE ${whereClause}` : ''}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated users with organization info for super admins
    paramCount++;
    const usersQuery = `
      SELECT 
        u.id, u.email, u.username, u.first_name, u.last_name,
        u.role, u.permissions, u.is_active, u.last_login,
        u.created_at, u.updated_at, u.organization_id,
        o.name as organization_name, o.organization_type
      FROM maes.users u
      LEFT JOIN maes.organizations o ON u.organization_id = o.id
      ${whereConditions.length > 0 ? `WHERE ${whereClause}` : ''}
      ORDER BY u.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    queryParams.push(parseInt(limit), offset);
    
    const usersResult = await pool.query(usersQuery, queryParams);

    res.json({
      success: true,
      users: usersResult.rows.map(user => ({
        ...user,
        firstName: user.first_name,
        lastName: user.last_name,
        isActive: user.is_active,
        lastLoginAt: user.last_login,
        createdAt: user.created_at,
        organizationId: user.organization_id,
        organizationName: user.organization_name,
        organizationType: user.organization_type
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      isSuperAdminView: allOrganizations && isSuperAdmin
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user by ID
router.get('/:userId', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId, organizationId: req.organizationId },
      include: [
        {
          model: Organization,
          as: 'Organization',
          attributes: ['id', 'name', 'organizationType']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Create new user
router.post('/', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      role,
      organizationId: targetOrgId,
      specialization = [],
      accessibleOrganizations = []
    } = req.body;

    // Validate required fields
    if (!email || !username || !password || !role) {
      return res.status(400).json({ error: 'Email, username, password, and role are required' });
    }

    // Determine target organization
    const isSuperAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const finalOrgId = (isSuperAdmin && targetOrgId) ? targetOrgId : req.organizationId;

    // Check if user already exists
    const existingUserQuery = `
      SELECT id FROM maes.users 
      WHERE email = $1 OR username = $2
    `;
    const existingUser = await pool.query(existingUserQuery, [email, username]);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    // Get target organization
    const orgQuery = `
      SELECT id, name, organization_type 
      FROM maes.organizations 
      WHERE id = $1
    `;
    const orgResult = await pool.query(orgQuery, [finalOrgId]);
    
    if (orgResult.rows.length === 0) {
      return res.status(400).json({ error: 'Organization not found' });
    }
    
    const organization = orgResult.rows[0];

    // For super admins, allow all roles; otherwise validate based on organization type
    if (!isSuperAdmin) {
      const validRoles = {
        mssp: ['mssp_admin', 'mssp_analyst', 'mssp_responder'],
        client: ['client_admin', 'client_analyst', 'client_viewer'],
        standalone: ['standalone_admin', 'standalone_analyst', 'standalone_viewer']
      };

      if (!validRoles[organization.organization_type]?.includes(role)) {
        return res.status(400).json({ error: `Invalid role for ${organization.organization_type} organization` });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const createUserQuery = `
      INSERT INTO maes.users (
        id, email, username, password_hash, first_name, last_name,
        role, organization_id, is_active, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW()
      )
      RETURNING id, email, username, first_name, last_name, role, organization_id, is_active, created_at
    `;
    
    const userResult = await pool.query(createUserQuery, [
      email, username, hashedPassword, firstName, lastName, role, finalOrgId
    ]);
    
    const user = userResult.rows[0];

    logger.info(`Created user: ${user.id} (${role}) in organization: ${finalOrgId}`);

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
        isActive: user.is_active,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:userId', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      firstName,
      lastName,
      role,
      specialization,
      accessibleOrganizations,
      isActive,
      preferences
    } = req.body;

    const user = await User.findOne({
      where: { id: userId, organizationId: req.organizationId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (specialization !== undefined) updateData.specialization = specialization;
    if (accessibleOrganizations !== undefined) updateData.accessibleOrganizations = accessibleOrganizations;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (preferences !== undefined) updateData.preferences = preferences;

    await user.update(updateData);

    logger.info(`Updated user: ${userId}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        permissions: user.permissions
      }
    });

  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Change user password
router.patch('/:userId/password', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const user = await User.findOne({
      where: { id: userId, organizationId: req.organizationId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Changed password for user: ${userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Deactivate user
router.patch('/:userId/deactivate', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId, organizationId: req.organizationId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deactivating self
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    await user.update({ isActive: false });

    logger.info(`Deactivated user: ${userId}`);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });

  } catch (error) {
    logger.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Reactivate user
router.patch('/:userId/permissions', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    // Validate permissions object
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Invalid permissions object' });
    }

    const user = await User.findById(userId);

    if (!user || user.organization_id !== req.organizationId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow users to modify their own permissions unless they are super admin
    const isSuperAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (userId === req.user.id && !isSuperAdmin) {
      return res.status(403).json({ error: 'Cannot modify your own permissions' });
    }

    // Update user permissions
    const updatedUser = await User.update(userId, { permissions });

    logger.info(`Updated permissions for user: ${userId}`);

    res.json({
      success: true,
      message: 'User permissions updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
        permissions: updatedUser.permissions
      }
    });

  } catch (error) {
    logger.error('Update user permissions error:', error);
    res.status(500).json({ error: 'Failed to update user permissions' });
  }
});

router.patch('/:userId/reactivate', authenticateToken, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId, organizationId: req.organizationId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.update({ isActive: true });

    logger.info(`Reactivated user: ${userId}`);

    res.json({
      success: true,
      message: 'User reactivated successfully'
    });

  } catch (error) {
    logger.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// Update user organization access
router.patch('/:userId/organization-access', authenticateToken, requireSuperAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;
    const { accessibleOrganizations } = req.body;

    // Validate accessibleOrganizations is an array
    if (!Array.isArray(accessibleOrganizations)) {
      return res.status(400).json({ error: 'accessibleOrganizations must be an array' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify all organizations exist
    for (const orgId of accessibleOrganizations) {
      const orgQuery = `SELECT id FROM maes.organizations WHERE id = $1`;
      const orgResult = await pool.query(orgQuery, [orgId]);
      if (orgResult.rows.length === 0) {
        return res.status(400).json({ error: `Organization ${orgId} not found` });
      }
    }

    // Clear existing organization access
    const deleteQuery = `DELETE FROM maes.user_organizations WHERE user_id = $1`;
    await pool.query(deleteQuery, [userId]);

    // Add new organization access
    for (const orgId of accessibleOrganizations) {
      const insertQuery = `
        INSERT INTO maes.user_organizations (id, user_id, organization_id, role, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, 'viewer', NOW(), NOW())
        ON CONFLICT (user_id, organization_id) DO NOTHING
      `;
      await pool.query(insertQuery, [userId, orgId]);
    }

    logger.info(`Updated organization access for user: ${userId}`);

    res.json({
      success: true,
      message: 'Organization access updated successfully'
    });

  } catch (error) {
    logger.error('Update organization access error:', error);
    res.status(500).json({ error: 'Failed to update organization access' });
  }
});

// Get current user profile
router.get('/profile/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Organization,
          as: 'Organization',
          attributes: ['id', 'name', 'organizationType', 'serviceTier']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Update current user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, preferences } = req.body;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (preferences !== undefined) {
      // Merge new preferences with existing ones
      const existingPreferences = user.preferences || {};
      updateData.preferences = { ...existingPreferences, ...preferences };
    }

    await user.update(updateData);

    logger.info(`Updated profile for user: ${req.user.id}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        preferences: user.preferences
      }
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change own password
router.patch('/profile/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await user.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`User ${req.user.id} changed their password`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change own password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router; 