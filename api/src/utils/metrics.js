const client = require('prom-client');

// Create a Registry to register the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'maes-api'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics for MAES Platform
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

const extractionJobsTotal = new client.Counter({
  name: 'extraction_jobs_total',
  help: 'Total number of extraction jobs',
  labelNames: ['type', 'status'],
});

const analysisJobsTotal = new client.Counter({
  name: 'analysis_jobs_total',
  help: 'Total number of analysis jobs',
  labelNames: ['type', 'status'],
});

const alertsTotal = new client.Counter({
  name: 'alerts_total',
  help: 'Total number of security alerts',
  labelNames: ['severity', 'type'],
});

const extractionJobDuration = new client.Histogram({
  name: 'extraction_job_duration_seconds',
  help: 'Duration of extraction jobs in seconds',
  labelNames: ['type'],
  buckets: [30, 60, 300, 600, 1800, 3600, 7200],
});

const analysisJobDuration = new client.Histogram({
  name: 'analysis_job_duration_seconds',
  help: 'Duration of analysis jobs in seconds',
  labelNames: ['type'],
  buckets: [10, 30, 60, 300, 600, 1800],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

const redisConnectionsActive = new client.Gauge({
  name: 'redis_connections_active',
  help: 'Number of active Redis connections',
});

const databaseConnectionsActive = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
});

const extractionQueueLength = new client.Gauge({
  name: 'extraction_queue_length',
  help: 'Number of jobs in extraction queue',
});

const analysisQueueLength = new client.Gauge({
  name: 'analysis_queue_length',
  help: 'Number of jobs in analysis queue',
});

// Register all metrics
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(extractionJobsTotal);
register.registerMetric(analysisJobsTotal);
register.registerMetric(alertsTotal);
register.registerMetric(extractionJobDuration);
register.registerMetric(analysisJobDuration);
register.registerMetric(activeConnections);
register.registerMetric(redisConnectionsActive);
register.registerMetric(databaseConnectionsActive);
register.registerMetric(extractionQueueLength);
register.registerMetric(analysisQueueLength);

// Middleware to track HTTP requests
const trackHttpRequests = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status_code: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route: route
    }, duration);
  });
  
  next();
};

module.exports = {
  register,
  metrics: {
    httpRequestsTotal,
    httpRequestDuration,
    extractionJobsTotal,
    analysisJobsTotal,
    alertsTotal,
    extractionJobDuration,
    analysisJobDuration,
    activeConnections,
    redisConnectionsActive,
    databaseConnectionsActive,
    extractionQueueLength,
    analysisQueueLength
  },
  trackHttpRequests
};