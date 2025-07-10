const elasticsearchService = require('../services/elasticsearch');
const { logger } = require('../utils/logger');

async function elasticsearchHealthCheck(req, res, next) {
  try {
    if (!elasticsearchService.initialized) {
      return res.status(503).json({
        error: 'Elasticsearch service not available',
        service: 'elasticsearch',
        status: 'unavailable'
      });
    }

    // Test Elasticsearch connection
    await elasticsearchService.client.ping();
    
    next();
  } catch (error) {
    logger.error('Elasticsearch health check failed:', error);
    return res.status(503).json({
      error: 'Elasticsearch service unavailable',
      service: 'elasticsearch',
      status: 'error'
    });
  }
}

module.exports = { elasticsearchHealthCheck }; 