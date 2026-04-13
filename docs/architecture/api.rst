.. _architecture-api:

API Service
===========

The API service is the central orchestration hub, built with Express.js. It handles authentication, routing, real-time events, file uploads, SIEM export, and serves the Swagger API documentation.

Entry Point
-----------

Source: ``api/src/index.js``

The server:

1. Validates required environment variables (``JWT_SECRET``, ``SERVICE_AUTH_TOKEN``, ``ENCRYPTION_KEY``)
2. Configures Helmet (CSP, HSTS), CORS (dynamic origin), compression, rate limiting
3. Mounts all route modules under ``/api/``
4. Starts Socket.IO for real-time events
5. Runs database migrations on startup
6. Listens on port 3000

Middleware Stack
----------------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Middleware
     - Purpose
   * - ``helmet``
     - CSP, HSTS, X-Frame-Options, X-Content-Type-Options
   * - ``compression``
     - Gzip response compression
   * - ``cors``
     - Dynamic origin from ``DOMAIN``, ``PUBLIC_IP``, ``FRONTEND_URL``, ``CORS_ORIGIN``
   * - ``express.json``
     - Body parsing (100 MB limit)
   * - ``morgan``
     - HTTP request logging to Winston
   * - ``rateLimiter``
     - Per-IP and per-route rate limits
   * - ``redirectHandler``
     - HTTP→HTTPS redirect logic
   * - ``trackHttpRequests``
     - Prometheus metrics collection

Route Modules
-------------

All routes are mounted under ``/api/``:

.. list-table::
   :header-rows: 1
   :widths: 25 25 50

   * - Prefix
     - File
     - Description
   * - ``/api/auth``
     - ``routes/auth.js``
     - Login, logout, admin consent callback
   * - ``/api/organizations``
     - ``routes/organizations.js``
     - CRUD, offboarding, credentials, configuration status
   * - ``/api/users``
     - ``routes/users.js``
     - User management, roles, permissions
   * - ``/api/user``
     - ``routes/user.js``
     - Profile, certificates, organizations, activity
   * - ``/api/extractions``
     - ``routes/extractions.js``
     - CRUD, status updates, logs, ZIP download
   * - ``/api/analysis``
     - ``routes/analysis.js``
     - CRUD, results, internal service endpoints
   * - ``/api/compliance``
     - ``routes/compliance.js``
     - Assessments, controls, reports, credential status
   * - ``/api/alerts``
     - ``routes/alerts.js``
     - CRUD, acknowledge, assign, resolve, statistics
   * - ``/api/reports``
     - ``routes/reports.js``
     - CRUD, download
   * - ``/api/upload``
     - ``routes/upload.js``
     - File upload (JSON/CSV/TXT/LOG), auto-analysis
   * - ``/api/siem``
     - ``routes/siem.js``
     - SIEM configurations, test, export
   * - ``/api/internal``
     - ``routes/internal.js``
     - Encrypt/decrypt, Docker system logs
   * - ``/api/system``
     - ``routes/system.js``
     - System logs and log statistics
   * - ``/api/registration``
     - ``routes/registration.js``
     - Public registration, tenant app info

Swagger Documentation
---------------------

Available at ``/api/docs`` when the API is running. Powered by ``swagger-jsdoc`` with OpenAPI 3.0.0 schema definitions auto-generated from JSDoc comments in route files.

Health & Metrics
----------------

- ``GET /health`` — Basic health check
- ``GET /api/health`` — Extended health with uptime and environment
- ``GET /metrics`` — Prometheus-formatted metrics
