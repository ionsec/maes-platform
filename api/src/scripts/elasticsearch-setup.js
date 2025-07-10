const elasticsearchService = require('../services/elasticsearch');
const { logger } = require('../utils/logger');

async function setupElasticsearch() {
  try {
    logger.info('Setting up Elasticsearch indices...');
    
    await elasticsearchService.initialize();
    
    logger.info('Elasticsearch setup completed successfully');
  } catch (error) {
    logger.error('Elasticsearch setup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupElasticsearch();
}

module.exports = { setupElasticsearch }; 