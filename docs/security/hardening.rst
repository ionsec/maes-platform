.. _security-hardening:

Hardening Guide
===============

Production Checklist
--------------------

.. list-table::
   :header-rows: 1
   :widths: 5 40 55

   * - #
     - Item
     - Action
   * - 1
     - Generate strong secrets
     - Use ``openssl rand -hex 32`` for all required secrets
   * - 2
     - Set NODE_ENV=production
     - Enables strict CSP, tighter CORS
   * - 3
     - Replace self-signed certificates
     - Use Let's Encrypt or organizational CA
   * - 4
     - Disable Docker log access
     - Keep ``ENABLE_DOCKER_LOGS=false`` unless explicitly needed
   * - 5
     - Restrict CORS origins
     - Set specific ``DOMAIN`` and ``CORS_ORIGIN``, avoid wildcards
   * - 6
     - Rotate default certificate
     - Replace ``certs/app.pfx`` with a production certificate
   * - 7
     - Review exposed ports
     - Only ports 80/443 should be externally accessible
   * - 8
     - Enable Prometheus alerting
     - Configure alert rules for service health
   * - 9
     - Set up log aggregation
     - Use Loki/Grafana for centralized logging
   * - 10
     - Regular dependency audits
     - Run ``npm audit --omit=dev`` in all service directories
   * - 11
     - Schedule regular backups
     - See :doc:`/deployment/backup-restore`
   * - 12
     - Review RBAC assignments
     - Minimize ``super_admin`` and ``admin`` role assignments

Container Security
------------------

- All base images are pinned by SHA256 digest
- No container runs in privileged mode (cAdvisor uses specific device mounts)
- PostgreSQL and Redis ports are not exposed externally
- Docker socket is not mounted by default
- Each service has a dedicated ``.dockerignore``

Network Security
----------------

- All inter-service communication happens on the ``maes-network`` bridge network
- The frontend nginx proxy is the only externally-facing service
- API authentication (JWT) is required for all non-public endpoints
- Service-to-service communication uses ``x-service-token`` header
- Rate limiting is applied per-IP and per-route

Application Security
--------------------

- **Helmet** — Sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **bcrypt** — Password hashing with salt
- **JWT blacklisting** — Tokens are invalidated on logout via Redis
- **Input validation** — ``express-validator`` on all user inputs
- **File upload** — MIME type checking, extension validation, path traversal detection, size limits
- **SQL injection** — Parameterized queries throughout
- **Account lockout** — 5 failed attempts → 30 minute lock
