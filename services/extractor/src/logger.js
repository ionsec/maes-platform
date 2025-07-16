const winston = require('winston');
const Transport = require('winston-transport');
const Redis = require('ioredis');

// Custom Redis transport for storing logs
class RedisTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.redis = new Redis(process.env.REDIS_URL);
    this.ttl = opts.ttl || 86400; // 24 hours default
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Store logs for extraction jobs
    if (info.extractionId) {
      const logEntry = {
        timestamp: info.timestamp || new Date().toISOString(),
        level: info.level,
        message: info.message,
        extractionId: info.extractionId
      };

      try {
        // Store in a Redis list with extraction ID as key
        const key = `extraction:logs:${info.extractionId}`;
        await this.redis.rpush(key, JSON.stringify(logEntry));
        await this.redis.expire(key, this.ttl);
      } catch (error) {
        console.error('Failed to store log in Redis:', error);
      }
    }

    callback();
  }
}

// Create logger with Redis transport
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'maes-extractor' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new RedisTransport({
      ttl: 86400 // 24 hours
    })
  ]
});

// Helper function to create extraction-specific logger
function createExtractionLogger(extractionId) {
  return {
    info: (message, meta = {}) => logger.info(message, { ...meta, extractionId }),
    error: (message, meta = {}) => logger.error(message, { ...meta, extractionId }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, extractionId }),
    debug: (message, meta = {}) => logger.debug(message, { ...meta, extractionId }),
    success: (message, meta = {}) => logger.info(message, { ...meta, extractionId, level: 'success' })
  };
}

module.exports = { logger, createExtractionLogger };