const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const iocEnrichment = require('../services/threatIntel/iocEnrichment');

const router = express.Router();

router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * Enrich single IP address
 */
router.get('/enrich/ip/:ip', 
  requirePermission('canAccessThreatIntel'),
  async (req, res) => {
    try {
      const { ip } = req.params;
      const result = await iocEnrichment.enrichIP(ip);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error enriching IP:', error);
      res.status(500).json({ error: 'Failed to enrich IP' });
    }
  }
);

/**
 * Enrich single domain
 */
router.get('/enrich/domain/:domain', 
  requirePermission('canAccessThreatIntel'),
  async (req, res) => {
    try {
      const { domain } = req.params;
      const result = await iocEnrichment.enrichDomain(domain);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error enriching domain:', error);
      res.status(500).json({ error: 'Failed to enrich domain' });
    }
  }
);

/**
 * Enrich file hash
 */
router.get('/enrich/hash/:hash', 
  requirePermission('canAccessThreatIntel'),
  async (req, res) => {
    try {
      const { hash } = req.params;
      const hashType = req.query.type || 'sha256';
      const result = await iocEnrichment.enrichHash(hash, hashType);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error enriching hash:', error);
      res.status(500).json({ error: 'Failed to enrich hash' });
    }
  }
);

/**
 * Bulk enrich multiple IOCs
 */
router.post('/enrich/bulk', 
  requirePermission('canAccessThreatIntel'),
  [
    body('iocs').isArray({ min: 1, max: 100 }).withMessage('iocs must be an array with 1-100 items'),
    body('iocs.*.value').isString().withMessage('IOC value is required'),
    body('iocs.*.type').isIn(['ip', 'domain', 'hash']).withMessage('IOC type must be ip, domain, or hash')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { iocs } = req.body;
      const result = await iocEnrichment.bulkEnrich(iocs);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error bulk enriching IOCs:', error);
      res.status(500).json({ error: 'Failed to bulk enrich IOCs' });
    }
  }
);

/**
 * Get enrichment statistics
 */
router.get('/stats', 
  requirePermission('canManageSystemSettings'),
  async (req, res) => {
    // Return provider status
    const providers = {
      virustotal: iocEnrichment.providers.virustotal.enabled,
      abuseipdb: iocEnrichment.providers.abuseipdb.enabled,
      shodan: iocEnrichment.providers.shodan.enabled,
      ipqualityscore: iocEnrichment.providers.ipqualityscore.enabled
    };
    
    res.json({
      success: true,
      providers,
      cache_size: iocEnrichment.cache.size
    });
  }
);

module.exports = router;
