.. _security-overview:

Security Overview
=================

The MAES platform implements multiple layers of security, hardened in v1.1.0.

Principles
----------

- **Fail fast on missing secrets** — Services exit immediately if required environment variables are not set
- **No default credentials** — No seeded admin account, no fallback tokens
- **Least privilege** — Docker containers run without unnecessary capabilities
- **Defense in depth** — Helmet CSP, rate limiting, JWT blacklisting, encryption at rest
- **Explicit opt-in** — Docker log access, CORS origins, and privilege escalation require explicit configuration

Changes in v1.1.0
-----------------

- Removed seeded default credentials (``admin@maes.local / admin123``)
- Removed insecure fallback secrets from runtime code and ``docker-compose.yml``
- Pinned all container base images by SHA256 digest
- Upgraded vulnerable Node dependencies until ``npm audit`` was clean
- Disabled Docker socket access by default (``ENABLE_DOCKER_LOGS=false``)
- Tightened CSP and CORS defaults in production mode
- Hardened service Dockerfiles

Attack Surface
--------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Vector
     - Mitigation
   * - Brute-force login
     - Account lockout after 5 failures (30 min), rate limiting
   * - Token theft
     - JWT blacklisting via Redis, short TTL (24h default)
   * - CSRF
     - SameSite cookies, CORS origin whitelist
   * - XSS
     - Helmet CSP, no ``unsafe-eval``
   * - Path traversal
     - File upload validation, sanitized filenames
   * - SQL injection
     - Parameterized queries throughout
   * - Supply chain
     - Pinned Docker images, audited NPM dependencies
   * - Privilege escalation
     - RBAC, organization-scoped data access
   * - Data exfiltration
     - Organization isolation, encrypted credentials at rest
