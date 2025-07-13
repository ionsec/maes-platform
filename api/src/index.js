const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { pool } = require('./services/database');
const { logger } = require('./utils/logger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { redirectHandler } = require('./middleware/redirectHandler');
const swaggerSpecs = require('./swagger');
const elasticsearchService = require('./services/elasticsearch');

// Import routes
const authRoutes = require('./routes/auth');
const organizationRoutes = require('./routes/organizations');
const userRoutes = require('./routes/users');
const extractionRoutes = require('./routes/extractions');
const analysisRoutes = require('./routes/analysis');
const alertRoutes = require('./routes/alerts');
const reportRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');
const registrationRoutes = require('./routes/registration');
const siemRoutes = require('./routes/siem');
const elasticsearchRoutes = require('./routes/elasticsearch');

const app = express();

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));

// Compression middleware
app.use(compression());

// CORS configuration - dynamic based on environment variables
const buildCorsOrigins = () => {
  const origins = [];

  // Always include localhost for development
  origins.push(
    'https://localhost',
    'https://localhost:443',
    'http://localhost:8080',
    'http://localhost',
    'http://localhost:3000',
    'https://localhost:3000'
  );

  // Add DOMAIN if provided
  if (process.env.DOMAIN) {
    const domain = process.env.DOMAIN;
    origins.push(
      `https://${domain}`,
      `http://${domain}`,
      `https://${domain}:443`,
      `http://${domain}:80`
    );
  }

  // Add PUBLIC_IP if provided
  if (process.env.PUBLIC_IP) {
    const publicIP = process.env.PUBLIC_IP;
    origins.push(
      `https://${publicIP}`,
      `http://${publicIP}`,
      `https://${publicIP}:443`,
      `http://${publicIP}:80`
    );
  }

  // Add FRONTEND_URL if provided
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }

  // Add explicit CORS_ORIGIN if provided (can be comma-separated)
  if (process.env.CORS_ORIGIN) {
    const corsOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
    origins.push(...corsOrigins);
  }

  // Add API URL variations
  if (process.env.API_URL) {
    origins.push(process.env.API_URL);
  }

  // Remove duplicates and filter out empty strings
  return [...new Set(origins.filter(origin => origin && origin.length > 0))];
};

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = buildCorsOrigins();
    
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the origin is in our allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log for debugging
      logger.warn(`CORS blocked origin: ${origin}. Allowed origins:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  // Allow all headers that might be sent
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting
app.use(rateLimiter);

// Redirect handler middleware
app.use(redirectHandler);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API documentation with custom options
const swaggerOptions = {
  swaggerOptions: {
    persistAuthorization: true,
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MAES API Documentation'
};

// Serve Swagger UI static assets explicitly
app.use('/api/docs', swaggerUi.serve);
app.get('/api/docs', swaggerUi.setup(swaggerSpecs, swaggerOptions));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/extractions', extractionRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/registration', registrationRoutes);
app.use('/api/siem', siemRoutes);
app.use('/api/elasticsearch', elasticsearchRoutes);

// Certificate download endpoint
app.get('/api/certificates/app.crt', (req, res) => {
  const path = require('path');
  const fs = require('fs');
  
  try {
    const certPath = path.join('/app/certs/app.crt');
    
    logger.info(`Attempting to serve certificate from: ${certPath}`);
    
    if (!fs.existsSync(certPath)) {
      logger.error(`Certificate not found at path: ${certPath}`);
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="app.crt"');
    res.sendFile(path.resolve(certPath));
  } catch (error) {
    logger.error('Certificate download error:', error);
    res.status(500).json({ error: 'Failed to download certificate' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

// Create HTTP server
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: buildCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
  
  // Join organization room
  socket.on('join-organization', (organizationId) => {
    socket.join(`org-${organizationId}`);
    logger.info(`Client ${socket.id} joined organization ${organizationId}`);
  });
  
  // Leave organization room
  socket.on('leave-organization', (organizationId) => {
    socket.leave(`org-${organizationId}`);
    logger.info(`Client ${socket.id} left organization ${organizationId}`);
  });
});

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 3000;

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection established successfully');

    // Initialize Elasticsearch service
    await elasticsearchService.initialize();
    logger.info('Elasticsearch service initialized successfully');

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = app;