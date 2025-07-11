const { logger } = require('../utils/logger');

/**
 * Middleware to handle redirect scenarios and ensure proper API responses
 * Prevents API from redirecting to localhost when accessed via public IP
 */
const redirectHandler = (req, res, next) => {
  // Set headers to prevent caching issues
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  // Get the original host from headers
  const originalHost = req.get('host');
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto');
  
  // Log request details for debugging
  logger.debug('Request details:', {
    originalHost,
    forwardedHost,
    forwardedProto,
    url: req.url,
    method: req.method,
    origin: req.get('origin')
  });

  // Ensure API responses are not redirected
  if (req.path.startsWith('/api/')) {
    // Set the proper base URL for API responses
    req.apiBaseUrl = forwardedProto && forwardedHost 
      ? `${forwardedProto}://${forwardedHost}`
      : `${req.protocol}://${req.get('host')}`;
  }

  next();
};

module.exports = { redirectHandler };