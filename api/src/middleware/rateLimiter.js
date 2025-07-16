const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// Development mode - more permissive limits
const isDevelopment = process.env.NODE_ENV === 'development';

// General rate limiter
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 1000, // Much higher limit for real-time operations
  message: {
    error: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later'
    });
  }
});

// Strict rate limiter for authentication endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // Higher limit in development
  message: {
    error: 'Too many login attempts from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again later'
    });
  }
});

// API rate limiter for extraction/analysis operations
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 10000 : 1000, // Much higher limit for real-time polling
  message: {
    error: 'API rate limit exceeded, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('API rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'API rate limit exceeded, please slow down'
    });
  }
});

module.exports = {
  rateLimiter,
  authRateLimiter,
  apiRateLimiter
};