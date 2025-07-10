const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { User, Organization, AuditLog } = require('../services/models');
const { authenticateToken } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and get JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       423:
 *         description: Account locked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Login endpoint
router.post('/login', 
  authRateLimiter,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { username, password } = req.body;

      // Find user by username or email
      const user = await User.findByUsernameOrEmail(username);

      if (!user || !user.is_active) {
        // Don't create audit log for non-existent users since we don't have organizationId
        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }

      // Check if user is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await AuditLog.create({
          userId: user.id,
          organizationId: user.organization_id,
          action: 'login_failed',
          category: 'authentication',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: { reason: 'account_locked', username }
        });

        return res.status(423).json({
          error: 'Account is temporarily locked due to too many failed attempts'
        });
      }

      // Validate password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        // Increment login attempts
        const newAttempts = user.login_attempts + 1;
        let lockedUntil = null;
        if (newAttempts >= 5) {
          lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        }
        await User.updateLoginAttempts(user.id, newAttempts, lockedUntil);

        await AuditLog.create({
          userId: user.id,
          organizationId: user.organization_id,
          action: 'login_failed',
          category: 'authentication',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: { reason: 'invalid_password', username, attempts: newAttempts }
        });

        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }

      // Check organization status
      if (!user.organization_active) {
        await AuditLog.create({
          userId: user.id,
          organizationId: user.organization_id,
          action: 'login_failed',
          category: 'authentication',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: { reason: 'organization_inactive', username }
        });

        return res.status(403).json({
          error: 'Organization is not active'
        });
      }

      // Reset login attempts and update last login
      await User.resetLoginAttempts(user.id);

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          organizationId: user.organization_id,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRY || '24h' }
      );

      // Log successful login
      await AuditLog.create({
        userId: user.id,
        organizationId: user.organization_id,
        action: 'login_success',
        category: 'authentication',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { username }
      });

      // Check if user needs onboarding
      const preferences = typeof user.preferences === 'string' ? 
        JSON.parse(user.preferences || '{}') : 
        user.preferences || {};
      
      // User needs onboarding if:
      // 1. Organization is still the default AND
      // 2. User hasn't completed onboarding before
      const needsOnboarding = user.organization_name === 'MAES Default Organization' && 
                              !preferences.onboardingCompleted;

      // Return user data (without password)
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        permissions: user.permissions,
        needsOnboarding,
        organization: {
          id: user.organization_id,
          name: user.organization_name,
          tenantId: user.tenant_id,
          fqdn: user.organization_fqdn,
          isActive: user.organization_active
        }
      };

      res.json({
        success: true,
        token,
        user: userData
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// Refresh token endpoint
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Generate new token
    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    // Return refreshed token and user data
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions,
      organization: user.Organization
    };

    res.json({
      success: true,
      token,
      user: userData
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Log logout action
    await AuditLog.create({
      userId: req.user.id,
      organizationId: req.organizationId,
      action: 'logout',
      category: 'authentication',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userData = {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      permissions: req.user.permissions,
      preferences: req.user.preferences,
      lastLogin: req.user.lastLogin,
      organization: req.user.Organization
    };

    res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Change password endpoint
router.put('/change-password', 
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Get user with current password
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        await AuditLog.create({
          userId: userId,
          organizationId: req.organizationId,
          action: 'password_change_failed',
          category: 'authentication',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: { reason: 'invalid_current_password' }
        });

        return res.status(401).json({
          error: 'Current password is incorrect'
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await User.updatePassword(userId, hashedPassword);

      // Log successful password change
      await AuditLog.create({
        userId: userId,
        organizationId: req.organizationId,
        action: 'password_changed',
        category: 'authentication',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/complete-onboarding:
 *   post:
 *     summary: Mark user onboarding as complete
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Onboarding marked as complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/complete-onboarding', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    
    logger.info('Complete onboarding request', { userId, organizationId: req.organizationId });
    
    // Directly update user preferences without needing to fetch the user first
    // This avoids the User.findById issue
    const query = `
      UPDATE maes.users 
      SET preferences = COALESCE(preferences, '{}')::jsonb || '{"onboardingCompleted": true}'::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `;
    
    const { getRow } = require('../services/database');
    const result = await getRow(query, [userId]);
    
    if (!result) {
      logger.error('User not found for onboarding completion', { userId });
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.info('Onboarding marked as complete', { userId });
    
    // Log the completion
    await AuditLog.create({
      userId: userId,
      organizationId: req.organizationId,
      action: 'onboarding_completed',
      category: 'authentication',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'Onboarding marked as complete'
    });
    
  } catch (error) {
    logger.error('Complete onboarding error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;