const express = require('express');
const EncryptionUtil = require('../utils/encryption');
const { logger } = require('../utils/logger');

const router = express.Router();

// Middleware to verify service token
const verifyServiceToken = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  
  if (!serviceToken || serviceToken !== process.env.SERVICE_AUTH_TOKEN) {
    logger.warn('Unauthorized internal API access attempt', {
      ip: req.ip,
      path: req.path,
      headers: req.headers
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Apply service token verification to all routes
router.use(verifyServiceToken);

/**
 * Decrypt encrypted data
 * This endpoint is only accessible by internal services with the service token
 */
router.post('/decrypt', async (req, res) => {
  try {
    const { encryptedData } = req.body;
    
    if (!encryptedData) {
      return res.status(400).json({ error: 'Missing encrypted data' });
    }
    
    const decrypted = EncryptionUtil.decrypt(encryptedData);
    
    res.json({
      success: true,
      decrypted
    });
  } catch (error) {
    logger.error('Decryption error:', error);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

/**
 * Encrypt data
 * This endpoint is only accessible by internal services with the service token
 */
router.post('/encrypt', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Missing data to encrypt' });
    }
    
    const encrypted = EncryptionUtil.encrypt(data);
    
    res.json({
      success: true,
      encrypted
    });
  } catch (error) {
    logger.error('Encryption error:', error);
    res.status(500).json({ error: 'Encryption failed' });
  }
});

module.exports = router;