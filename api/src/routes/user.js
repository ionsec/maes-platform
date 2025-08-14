const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const EncryptionUtil = require('../utils/encryption');
const { User } = require('../services/models');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(apiRateLimiter);

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${req.userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure multer for certificate uploads
const certificateStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = '/app/uploads/certificates';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `cert-${req.userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const certificateUpload = multer({ 
  storage: certificateStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for certificates
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pfx|p12/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only .pfx and .p12 certificate files are allowed'));
    }
  }
});

// In-memory storage for demo purposes (in production, use database)
let users = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@ionsec.io',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1-555-0123',
    organization: 'IONSEC.IO',
    department: 'Security Operations',
    jobTitle: 'Security Analyst',
    location: 'Tel Aviv, Israel',
    bio: 'Experienced cybersecurity professional specializing in incident response and digital forensics.',
    profilePicture: null,
    preferences: {
      emailNotifications: true,
      pushNotifications: false,
      securityAlerts: true,
      systemUpdates: true,
      reportNotifications: true,
      language: 'en',
      timezone: 'Asia/Jerusalem',
      dateFormat: 'YYYY-MM-DD',
      theme: 'dark'
    },
    createdAt: new Date('2023-01-01').toISOString(),
    lastLoginAt: new Date().toISOString(),
    organizationId: 1
  }
];

let userSessions = [
  {
    id: 1,
    userId: 1,
    deviceType: 'Desktop',
    browser: 'Chrome 120.0',
    ipAddress: '192.168.1.100',
    location: 'Tel Aviv, Israel',
    lastActivity: new Date().toISOString(),
    current: true
  },
  {
    id: 2,
    userId: 1,
    deviceType: 'Mobile',
    browser: 'Safari 17.0',
    ipAddress: '10.0.0.50',
    location: 'Tel Aviv, Israel',
    lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    current: false
  }
];

let userActivity = [
  {
    userId: 1,
    action: 'User logged in',
    type: 'authentication',
    timestamp: new Date().toISOString(),
    details: 'Successful login from Chrome browser'
  },
  {
    userId: 1,
    action: 'Profile updated',
    type: 'profile',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    details: 'Updated contact information'
  },
  {
    userId: 1,
    action: 'Password changed',
    type: 'security',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    details: 'Password changed successfully'
  },
  {
    userId: 1,
    action: 'New analysis started',
    type: 'analysis',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'UAL analysis job initiated'
  },
  {
    userId: 1,
    action: 'Report generated',
    type: 'report',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'Executive summary report created'
  }
];

// In-memory storage for user certificates (in production, use database)
let userCertificates = [];

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove sensitive information and format response
    const { password, ...userProfile } = user;
    
    // Parse preferences if they're stored as JSON string
    if (userProfile.preferences && typeof userProfile.preferences === 'string') {
      try {
        userProfile.preferences = JSON.parse(userProfile.preferences);
      } catch (e) {
        // If parsing fails, keep as is
        logger.warn('Failed to parse user preferences:', e);
      }
    }
    
    res.json({
      success: true,
      user: userProfile
    });
  } catch (error) {
    logger.error('Failed to get user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 */
router.put('/profile',
  [
    body('firstName').optional().isString().isLength({ min: 1 }).withMessage('First name is required'),
    body('lastName').optional().isString().isLength({ min: 1 }).withMessage('Last name is required'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').optional().isString(),
    body('organization').optional().isString(),
    body('department').optional().isString(),
    body('jobTitle').optional().isString(),
    body('location').optional().isString(),
    body('bio').optional().isString()
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

      const userId = req.user?.id || req.userId;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update user profile in database
      const updatedUser = await User.update(userId, req.body);
      
      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      // Log activity (keeping for compatibility)
      userActivity.unshift({
        userId: userId,
        action: 'Profile updated',
        type: 'profile',
        timestamp: new Date().toISOString(),
        details: 'Profile information updated'
      });

      // Remove sensitive information
      const { password, ...userProfile } = updatedUser;
      
      // Parse preferences if they're stored as JSON string
      if (userProfile.preferences && typeof userProfile.preferences === 'string') {
        try {
          userProfile.preferences = JSON.parse(userProfile.preferences);
        } catch (e) {
          // If parsing fails, keep as is
        }
      }

      res.json({
        success: true,
        user: userProfile,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /api/user/password:
 *   put:
 *     summary: Change user password
 *     tags: [User]
 */
router.put('/password',
  [
    body('currentPassword').isString().withMessage('Current password is required'),
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
      const user = users.find(u => u.id === req.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // In a real app, verify current password
      // const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      // if (!isCurrentPasswordValid) {
      //   return res.status(400).json({ error: 'Current password is incorrect' });
      // }

      // Hash new password
      // const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      // user.password = hashedNewPassword;

      // For demo purposes, just simulate password change
      user.passwordChangedAt = new Date().toISOString();

      // Log security activity
      userActivity.unshift({
        userId: req.userId,
        action: 'Password changed',
        type: 'security',
        timestamp: new Date().toISOString(),
        details: 'Password changed successfully'
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Failed to change password:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @swagger
 * /api/user/profile-picture:
 *   post:
 *     summary: Upload profile picture
 *     tags: [User]
 */
router.post('/profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userIndex = users.findIndex(u => u.id === req.userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove old profile picture if exists
    if (users[userIndex].profilePicture) {
      const oldPath = path.join(__dirname, '../../', users[userIndex].profilePicture);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update user with new profile picture path
    const profilePicturePath = `/uploads/profiles/${req.file.filename}`;
    users[userIndex].profilePicture = profilePicturePath;
    users[userIndex].updatedAt = new Date().toISOString();

    // Log activity
    userActivity.unshift({
      userId: req.userId,
      action: 'Profile picture updated',
      type: 'profile',
      timestamp: new Date().toISOString(),
      details: 'Profile picture uploaded'
    });

    const { password, ...userProfile } = users[userIndex];

    res.json({
      success: true,
      user: userProfile,
      message: 'Profile picture updated successfully'
    });
  } catch (error) {
    logger.error('Failed to upload profile picture:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

/**
 * @swagger
 * /api/user/preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [User]
 */
router.get('/preferences', async (req, res) => {
  try {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      preferences: user.preferences || {}
    });
  } catch (error) {
    logger.error('Failed to get user preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/preferences:
 *   put:
 *     summary: Update user preferences
 *     tags: [User]
 */
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;
    const userId = req.user?.id || req.userId;
    
    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Merge new preferences with existing ones
    const existingPreferences = typeof user.preferences === 'string' 
      ? JSON.parse(user.preferences) 
      : (user.preferences || {});
    
    const updatedPreferences = {
      ...existingPreferences,
      ...preferences
    };

    // Update user preferences in database
    const updatedUser = await User.update(userId, {
      preferences: updatedPreferences
    });

    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    // Log activity (keeping for compatibility, though in production this should be in audit_logs table)
    userActivity.unshift({
      userId: userId,
      action: 'Preferences updated',
      type: 'profile',
      timestamp: new Date().toISOString(),
      details: 'User preferences modified'
    });

    // Parse preferences if they're a string
    const returnPreferences = typeof updatedUser.preferences === 'string'
      ? JSON.parse(updatedUser.preferences)
      : updatedUser.preferences;

    res.json({
      success: true,
      preferences: returnPreferences,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @swagger
 * /api/user/sessions:
 *   get:
 *     summary: Get user active sessions
 *     tags: [User]
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = userSessions.filter(session => session.userId === req.userId);
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    logger.error('Failed to get user sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/sessions/{sessionId}:
 *   delete:
 *     summary: Terminate a specific session
 *     tags: [User]
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const sessionIndex = userSessions.findIndex(
      session => session.id === sessionId && session.userId === req.userId
    );

    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }

    userSessions.splice(sessionIndex, 1);

    // Log security activity
    userActivity.unshift({
      userId: req.userId,
      action: 'Session terminated',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: `Session ${sessionId} terminated`
    });

    res.json({
      success: true,
      message: 'Session terminated successfully'
    });
  } catch (error) {
    logger.error('Failed to terminate session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/sessions/terminate-others:
 *   post:
 *     summary: Terminate all other sessions except current
 *     tags: [User]
 */
router.post('/sessions/terminate-others', async (req, res) => {
  try {
    const terminatedCount = userSessions.length;
    
    // Keep only current session (in real app, identify by session token)
    userSessions = userSessions.filter(session => 
      session.userId === req.userId && session.current
    );

    // Log security activity
    userActivity.unshift({
      userId: req.userId,
      action: 'All other sessions terminated',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: `${terminatedCount - 1} sessions terminated`
    });

    res.json({
      success: true,
      message: `${terminatedCount - 1} sessions terminated successfully`
    });
  } catch (error) {
    logger.error('Failed to terminate sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/activity:
 *   get:
 *     summary: Get user activity log
 *     tags: [User]
 */
router.get('/activity', async (req, res) => {
  try {
    const activities = userActivity
      .filter(activity => activity.userId === req.userId)
      .slice(0, 50) // Return last 50 activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    logger.error('Failed to get user activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/2fa/enable:
 *   post:
 *     summary: Enable two-factor authentication
 *     tags: [User]
 */
router.post('/2fa/enable', async (req, res) => {
  try {
    // This is a placeholder for 2FA implementation
    // In a real app, you would generate QR code, verify TOTP, etc.
    
    const userIndex = users.findIndex(u => u.id === req.userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].twoFactorEnabled = true;
    users[userIndex].updatedAt = new Date().toISOString();

    // Log security activity
    userActivity.unshift({
      userId: req.userId,
      action: 'Two-factor authentication enabled',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: '2FA enabled for account'
    });

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUGAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' // Placeholder
    });
  } catch (error) {
    logger.error('Failed to enable 2FA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/certificate:
 *   post:
 *     summary: Upload user certificate
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               certificate:
 *                 type: string
 *                 format: binary
 *               password:
 *                 type: string
 *               organizationId:
 *                 type: string
 */
router.post('/certificate', certificateUpload.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No certificate file uploaded' });
    }

    const { password, organizationId } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Certificate password is required' });
    }

    // Basic certificate validation
    const certificateFile = req.file;
    
    // Check file size (limit to 10MB)
    if (certificateFile.size > 10 * 1024 * 1024) {
      fs.unlinkSync(certificateFile.path); // Clean up uploaded file
      return res.status(400).json({ error: 'Certificate file too large (maximum 10MB)' });
    }
    
    // Check file extension
    const allowedExtensions = ['.pfx', '.p12'];
    const fileExtension = path.extname(certificateFile.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      fs.unlinkSync(certificateFile.path); // Clean up uploaded file
      return res.status(400).json({ error: 'Invalid file format. Only .pfx and .p12 files are allowed' });
    }
    
    // Validate certificate with password
    let thumbprint;
    let encryptedPassword;
    
    try {
      // Try PowerShell validation first (if available)
      logger.info('Attempting certificate validation with PowerShell...');
      
      const psCommand = `
        try {
          $certPath = '${certificateFile.path.replace(/\\/g, '/')}';
          $certPassword = '${password.replace(/'/g, "''")}';
          $securePwd = ConvertTo-SecureString $certPassword -AsPlainText -Force;
          
          # Try to load the certificate with the provided password
          $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
            $certPath,
            $securePwd,
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
          );
          
          # Check if certificate has private key
          if (-not $cert.HasPrivateKey) {
            Write-Output "ERROR: Certificate does not contain a private key";
            exit 1;
          }
          
          # Check if certificate is expired
          $now = Get-Date;
          if ($cert.NotAfter -lt $now) {
            Write-Output "WARNING: Certificate expired on $($cert.NotAfter)";
          }
          
          # Output certificate details
          Write-Output "SUCCESS";
          Write-Output "Thumbprint: $($cert.Thumbprint)";
          Write-Output "Subject: $($cert.Subject)";
          Write-Output "ValidFrom: $($cert.NotBefore)";
          Write-Output "ValidUntil: $($cert.NotAfter)";
          exit 0;
        } catch {
          Write-Output "ERROR: $_";
          exit 1;
        }
      `;
      
      const { stdout, stderr } = await execPromise(`pwsh -Command "${psCommand}"`, { timeout: 10000 });
      
      if (stderr || !stdout.includes('SUCCESS')) {
        throw new Error(`PowerShell validation failed: ${stdout} ${stderr}`);
      }
      
      // Extract thumbprint from output
      const thumbprintMatch = stdout.match(/Thumbprint:\s*([A-F0-9]+)/);
      thumbprint = thumbprintMatch ? thumbprintMatch[1] : null;
      
      // Extract certificate details for logging
      const subjectMatch = stdout.match(/Subject:\s*(.+)/);
      logger.info('Certificate validated successfully with PowerShell:', {
        thumbprint: thumbprint,
        subject: subjectMatch ? subjectMatch[1] : 'Unknown'
      });
      
      // Check if certificate is expired
      if (stdout.includes('WARNING: Certificate expired')) {
        fs.unlinkSync(certificateFile.path);
        return res.status(400).json({ error: 'Certificate has expired. Please upload a valid certificate.' });
      }
      
    } catch (psError) {
      // PowerShell validation failed, fall back to basic validation
      logger.warn('PowerShell validation failed, using basic validation:', psError.message);
      
      // Basic file validation - just check if it's a valid certificate file
      try {
        const certBuffer = fs.readFileSync(certificateFile.path);
        
        // Check for .pfx/.p12 file signatures
        if (certBuffer.length < 100) {
          throw new Error('Certificate file too small');
        }
        
        // Generate a simple thumbprint for storage
        thumbprint = crypto.createHash('sha1')
          .update(certBuffer)
          .digest('hex')
          .toUpperCase();
          
        logger.info('Certificate validated with basic method:', { thumbprint });
        
      } catch (basicError) {
        fs.unlinkSync(certificateFile.path);
        logger.error('Basic certificate validation failed:', basicError);
        return res.status(400).json({ 
          error: 'Certificate validation failed. Please ensure the file is a valid .pfx certificate and PowerShell is available.' 
        });
      }
    }
    
    // Encrypt the certificate password for storage
    try {
      encryptedPassword = EncryptionUtil.encrypt(password);
    } catch (encryptError) {
      fs.unlinkSync(certificateFile.path);
      logger.error('Password encryption failed:', encryptError);
      return res.status(500).json({ error: 'Failed to encrypt certificate password.' });
    }

    // Create certificate record
    const certificate = {
      id: Date.now(),
      userId: req.userId,
      organizationId: organizationId || 'default',
      filename: req.file.originalname,
      storedFilename: req.file.filename,
      filePath: `/app/uploads/certificates/${req.file.filename}`,
      thumbprint: thumbprint,
      encryptedPassword: encryptedPassword,
      uploadedAt: new Date().toISOString(),
      isActive: true
    };

    // Check certificate limit per user (security measure)
    const userCertCount = userCertificates.filter(cert => cert.userId === req.userId).length;
    const maxCertificatesPerUser = 5; // Limit to 5 certificates per user
    
    if (userCertCount >= maxCertificatesPerUser) {
      fs.unlinkSync(certificateFile.path); // Clean up uploaded file
      return res.status(400).json({ 
        error: `Maximum number of certificates reached (${maxCertificatesPerUser}). Please delete an existing certificate first.` 
      });
    }
    
    // Deactivate other certificates for this user/organization
    userCertificates.forEach(cert => {
      if (cert.userId === req.userId && cert.organizationId === organizationId) {
        cert.isActive = false;
      }
    });

    // Add new certificate
    userCertificates.push(certificate);

    // Log activity with security details
    userActivity.unshift({
      userId: req.userId,
      action: 'Certificate uploaded',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: `Certificate ${req.file.originalname} uploaded successfully`,
      metadata: {
        filename: req.file.originalname,
        fileSize: req.file.size,
        thumbprint: thumbprint,
        organizationId: organizationId || 'default',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    // Security logging
    logger.info('Certificate uploaded:', {
      userId: req.userId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      organizationId: organizationId || 'default',
      thumbprint: thumbprint,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      certificate: {
        id: certificate.id,
        filename: certificate.filename,
        thumbprint: certificate.thumbprint,
        uploadedAt: certificate.uploadedAt,
        isActive: certificate.isActive
      },
      message: 'Certificate uploaded successfully'
    });
  } catch (error) {
    logger.error('Failed to upload certificate:', error);
    res.status(500).json({ error: 'Failed to upload certificate' });
  }
});

/**
 * @swagger
 * /api/user/certificates:
 *   get:
 *     summary: Get user certificates
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 */
router.get('/certificates', async (req, res) => {
  try {
    // Check if this is a service request (from extractor)
    const serviceToken = req.headers['x-service-token'];
    const requestedUserId = req.headers['x-user-id'];
    const organizationId = req.query.organizationId;
    
    let userId = req.userId;
    
    // If service token is provided, allow access to any user's certificates
    if (serviceToken && serviceToken === process.env.SERVICE_AUTH_TOKEN) {
      userId = requestedUserId || req.userId;
      logger.info(`Service request for certificates - userId: ${userId}, organizationId: ${organizationId}`);
    }
    
    const certificates = userCertificates
      .filter(cert => {
        let matches = cert.userId == userId; // Use loose equality for flexibility
        if (organizationId) {
          matches = matches && cert.organizationId === organizationId;
        }
        return matches;
      })
      .map(cert => {
        const certData = {
          id: cert.id,
          filename: cert.filename,
          thumbprint: cert.thumbprint,
          uploadedAt: cert.uploadedAt,
          isActive: cert.isActive,
          organizationId: cert.organizationId,
          filePath: cert.filePath
        };
        
        // Only include encrypted password for service requests
        if (serviceToken && serviceToken === process.env.SERVICE_AUTH_TOKEN) {
          certData.encryptedPassword = cert.encryptedPassword;
        }
        
        return certData;
      });

    res.json({
      success: true,
      certificates
    });
  } catch (error) {
    logger.error('Failed to get certificates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/certificates/{certificateId}:
 *   delete:
 *     summary: Delete user certificate
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/certificates/:certificateId', async (req, res) => {
  try {
    const certificateId = parseInt(req.params.certificateId);
    const certificateIndex = userCertificates.findIndex(
      cert => cert.id === certificateId && cert.userId === req.userId
    );

    if (certificateIndex === -1) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const certificate = userCertificates[certificateIndex];

    // Delete the actual file
    const filePath = certificate.filePath;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from array
    userCertificates.splice(certificateIndex, 1);

    // Log activity with security details
    userActivity.unshift({
      userId: req.userId,
      action: 'Certificate deleted',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: `Certificate ${certificate.filename} deleted`,
      metadata: {
        filename: certificate.filename,
        thumbprint: certificate.thumbprint,
        organizationId: certificate.organizationId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    // Security logging
    logger.warn('Certificate deleted:', {
      userId: req.userId,
      filename: certificate.filename,
      thumbprint: certificate.thumbprint,
      organizationId: certificate.organizationId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Certificate deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete certificate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/user/certificates/{certificateId}/activate:
 *   post:
 *     summary: Activate user certificate
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 */
router.post('/certificates/:certificateId/activate', async (req, res) => {
  try {
    const certificateId = parseInt(req.params.certificateId);
    const certificate = userCertificates.find(
      cert => cert.id === certificateId && cert.userId === req.userId
    );

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Deactivate other certificates for this user/organization
    userCertificates.forEach(cert => {
      if (cert.userId === req.userId && cert.organizationId === certificate.organizationId) {
        cert.isActive = false;
      }
    });

    // Activate the selected certificate
    certificate.isActive = true;

    // Log activity
    userActivity.unshift({
      userId: req.userId,
      action: 'Certificate activated',
      type: 'security',
      timestamp: new Date().toISOString(),
      details: `Certificate ${certificate.filename} activated`
    });

    res.json({
      success: true,
      message: 'Certificate activated successfully'
    });
  } catch (error) {
    logger.error('Failed to activate certificate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's accessible organizations
router.get('/organizations', async (req, res) => {
  try {
    const { getRows } = require('../services/database');
    
    const userOrganizations = await getRows(`
      SELECT 
        uo.organization_id,
        uo.role,
        uo.permissions,
        uo.is_primary,
        o.name as organization_name,
        o.fqdn as organization_fqdn,
        o.tenant_id as organization_tenant_id
      FROM maes.user_organizations uo
      LEFT JOIN maes.organizations o ON uo.organization_id = o.id
      WHERE uo.user_id = $1
      ORDER BY uo.is_primary DESC, o.name ASC
    `, [req.userId]);

    res.json({
      success: true,
      organizations: userOrganizations
    });

  } catch (error) {
    logger.error('Get user organizations error:', error);
    res.status(500).json({ error: 'Failed to fetch user organizations' });
  }
});

// Add organization to user
router.post('/organizations', 
  [
    body('name').isString().isLength({ min: 1 }).withMessage('Organization name is required'),
    body('fqdn').isString().matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/).withMessage('Invalid FQDN format'),
    body('tenantId').isUUID().withMessage('Valid tenant ID is required')
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

      const { getRow, query } = require('../services/database');
      const { name, fqdn, tenantId } = req.body;
      
      // Check if organization already exists
      let organization = await getRow(
        'SELECT id FROM maes.organizations WHERE tenant_id = $1 OR fqdn = $2',
        [tenantId, fqdn]
      );
      
      if (!organization) {
        // Create new organization
        organization = await getRow(`
          INSERT INTO maes.organizations (name, fqdn, tenant_id, settings, created_at, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [name, fqdn, tenantId, JSON.stringify({})]);
      }
      
      // Check if user is already associated with this organization
      const existingRelation = await getRow(
        'SELECT id FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.userId, organization.id]
      );
      
      if (existingRelation) {
        return res.status(400).json({ error: 'You are already associated with this organization' });
      }
      
      // Add user to organization
      await query(`
        INSERT INTO maes.user_organizations (user_id, organization_id, role, permissions, is_primary)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        req.userId, 
        organization.id, 
        'admin', 
        JSON.stringify({
          canManageUsers: true,
          canRunAnalysis: true,
          canViewReports: true,
          canManageAlerts: true,
          canManageExtractions: true,
          canManageOrganization: true,
          canManageSystemSettings: true
        }),
        false // Not primary since user already has organizations
      ]);
      
      res.json({
        success: true,
        organizationId: organization.id,
        message: 'Organization added successfully'
      });
      
    } catch (error) {
      logger.error('Add user organization error:', error);
      res.status(500).json({ error: 'Failed to add organization' });
    }
  }
);

module.exports = router;