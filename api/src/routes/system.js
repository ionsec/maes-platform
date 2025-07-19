const express = require('express');
const axios = require('axios');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(apiRateLimiter);

/**
 * Get system logs (requires system management permission)
 */
router.get('/logs', 
  requirePermission('canManageSystemSettings'),
  async (req, res) => {
    try {
      const { 
        container = 'all', 
        lines = '100', 
        since = '', 
        level = 'all',
        search = '',
        page = 1,
        limit = 50
      } = req.query;

      // Call internal API to get logs
      const internalResponse = await axios.get('http://localhost:3000/api/internal/system-logs', {
        params: { container, lines, since, level, search },
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN
        },
        timeout: 30000 // 30 second timeout for log fetching
      });

      const { logs, totalFetched, limitApplied, containers } = internalResponse.data;

      // Apply pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 50;
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedLogs = logs.slice(startIndex, endIndex);

      // Calculate pagination info
      const totalPages = Math.ceil(logs.length / limitNum);

      res.json({
        success: true,
        logs: paginatedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: logs.length,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        },
        meta: {
          totalFetched,
          limitApplied,
          containers,
          filters: { container, lines, since, level, search }
        }
      });

    } catch (error) {
      logger.error('System logs API error:', error);
      
      if (error.response?.status === 401) {
        return res.status(500).json({ error: 'Internal service authentication failed' });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch system logs',
        details: error.message 
      });
    }
  }
);

/**
 * Get system log statistics
 */
router.get('/logs/stats',
  requirePermission('canManageSystemSettings'),
  async (req, res) => {
    try {
      const { since = '1h' } = req.query;

      // Get recent logs to calculate stats
      const internalResponse = await axios.get('http://localhost:3000/api/internal/system-logs', {
        params: { container: 'all', lines: '500', since },
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN
        },
        timeout: 30000
      });

      const { logs } = internalResponse.data;

      // Calculate statistics
      const stats = {
        total: logs.length,
        byLevel: {
          info: logs.filter(log => log.level === 'info').length,
          warning: logs.filter(log => log.level === 'warning').length,
          error: logs.filter(log => log.level === 'error').length,
          debug: logs.filter(log => log.level === 'debug').length
        },
        byContainer: {},
        recentErrors: logs
          .filter(log => log.level === 'error')
          .slice(0, 5)
          .map(log => ({
            timestamp: log.timestamp,
            container: log.container,
            message: log.message
          }))
      };

      // Count by container
      logs.forEach(log => {
        stats.byContainer[log.container] = (stats.byContainer[log.container] || 0) + 1;
      });

      res.json({
        success: true,
        stats,
        timeframe: since
      });

    } catch (error) {
      logger.error('System log stats error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch log statistics',
        details: error.message 
      });
    }
  }
);

module.exports = router;