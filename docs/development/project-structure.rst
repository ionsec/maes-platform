.. _project-structure:

Project Structure
=================

::

   maes-platform/
   ├── api/                          # API server
   │   ├── src/
   │   │   ├── index.js              # Entry point, Express app setup
   │   │   ├── swagger.js            # OpenAPI 3.0 spec generator
   │   │   ├── middleware/
   │   │   │   ├── auth.js           # JWT auth, RBAC, token blacklisting
   │   │   │   ├── errorHandler.js   # Global error handler
   │   │   │   ├── rateLimiter.js    # Per-IP and per-route limits
   │   │   │   └── redirectHandler.js # HTTP→HTTPS redirect
   │   │   ├── routes/
   │   │   │   ├── auth.js           # /api/auth
   │   │   │   ├── organizations.js  # /api/organizations
   │   │   │   ├── users.js          # /api/users
   │   │   │   ├── user.js           # /api/user
   │   │   │   ├── extractions.js    # /api/extractions
   │   │   │   ├── analysis.js       # /api/analysis
   │   │   │   ├── compliance.js      # /api/compliance
   │   │   │   ├── alerts.js         # /api/alerts
   │   │   │   ├── reports.js        # /api/reports
   │   │   │   ├── upload.js         # /api/upload
   │   │   │   ├── siem.js           # /api/siem
   │   │   │   ├── system.js         # /api/system
   │   │   │   ├── internal.js       # /api/internal
   │   │   │   └── registration.js   # /api/registration
   │   │   ├── services/
   │   │   │   ├── database.js       # PostgreSQL connection pool
   │   │   │   ├── jobService.js     # BullMQ job creation
   │   │   │   └── models.js         # Data access layer
   │   │   └── utils/
   │   │       ├── encryption.js     # AES-256-CBC encryption
   │   │       ├── logger.js         # Winston logger
   │   │       ├── metrics.js        # Prometheus metrics
   │   │       ├── migrate.js        # Migration runner
   │   │       └── platformCapabilities.js # Shared capabilities
   │   ├── models/                   # Sequelize models
   │   ├── migrations/               # Sequelize migrations
   │   ├── config/
   │   └── Dockerfile
   │
   ├── frontend/                     # React SPA
   │   ├── src/
   │   │   ├── App.jsx               # Root component with routing
   │   │   ├── main.jsx              # Entry point
   │   │   ├── components/           # Shared components
   │   │   ├── pages/                 # Route pages
   │   │   ├── contexts/             # React contexts (Auth, Org, Tour)
   │   │   ├── stores/               # Zustand stores (auth, org)
   │   │   ├── hooks/                # Custom hooks
   │   │   ├── theme/                # MUI theme definitions (5 themes)
   │   │   ├── config/               # API configuration
   │   │   └── utils/                # Axios instance, capabilities
   │   ├── public/
   │   ├── nginx.conf.template       # Nginx config with env substitution
   │   ├── vite.config.js
   │   └── Dockerfile
   │
   ├── services/
   │   ├── extractor/                 # M365 extraction worker
   │   │   ├── src/
   │   │   │   ├── index.js          # BullMQ worker, PowerShell runner
   │   │   │   ├── platformCapabilities.js
   │   │   │   ├── progressMonitor.js
   │   │   │   ├── cleanup.js
   │   │   │   └── logger.js
   │   │   ├── startup.ps1           # PowerShell module setup
   │   │   └── Dockerfile
   │   │
   │   ├── analyzer/                  # Forensic analysis worker
   │   │   ├── src/
   │   │   │   ├── index.js          # BullMQ worker
   │   │   │   ├── enhancedAnalyzer.js # Detection engine
   │   │   │   ├── jobProcessor.js   # Multi-threaded processor
   │   │   │   ├── cleanup.js
   │   │   │   └── logger.js
   │   │   ├── config/               # Blacklists, whitelists, config
   │   │   └── Dockerfile
   │   │
   │   └── compliance/                # CIS compliance worker
   │       ├── src/
   │       │   ├── index.js           # BullMQ worker + Express API
   │       │   ├── services/
   │       │   │   ├── assessmentEngine.js  # CIS control checker
   │       │   │   ├── graphClient.js        # MSAL + Graph API
   │       │   │   ├── reportGenerator.js    # Report generation
   │       │   │   ├── scheduler.js          # Scheduled assessments
   │       │   │   └── database.js           # DB access
   │       │   └── logger.js
   │       └── Dockerfile
   │
   ├── shared/
   │   └── platformCapabilities.json  # Shared extraction/analysis registry
   │
   ├── database/
   │   ├── init.sql                   # Bootstrap schema
   │   ├── 02-run-migrations.sh       # Migration runner
   │   └── migrations/                # 001–013 SQL migrations
   │
   ├── monitoring/
   │   ├── prometheus.yml
   │   ├── grafana/                   # Provisioning + dashboards
   │   ├── loki-config.yml
   │   └── promtail-config.yml
   │
   ├── certs/                         # SSL and M365 certificates
   ├── ssl/                           # Let's Encrypt init script
   ├── scripts/                       # Domain setup scripts
   ├── docs/                          # This documentation
   │
   ├── docker-compose.yml             # Production compose
   ├── docker-compose.dev.yml          # Development overrides
   ├── docker-compose.prod.yml         # Production overrides
   ├── .env.example                    # Environment template
   ├── ARCHITECTURE.md
   ├── CHANGELOG.md
   └── README.md
