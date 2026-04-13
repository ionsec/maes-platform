.. _environment-variables:

Environment Variables
=====================

All configuration is handled through environment variables. Copy ``.env.example`` as the starting template.

Required Secrets
----------------

.. warning::
   The platform will refuse to start if any of these are missing or empty.

.. list-table::
   :header-rows: 1
   :widths: 25 15 20 40

   * - Variable
     - Min Length
     - Service
     - Notes
   * - ``POSTGRES_PASSWORD``
     - 24 chars
     - Postgres
     - Database user password
   * - ``REDIS_PASSWORD``
     - 24 chars
     - Redis
     - Cache and queue auth
   * - ``JWT_SECRET``
     - 32 chars
     - API
     - JWT signing key
   * - ``SERVICE_AUTH_TOKEN``
     - 32 chars
     - All
     - Shared internal service token
   * - ``ENCRYPTION_KEY``
     - 32 chars
     - API
     - AES-256-CBC credential encryption
   * - ``CERT_PASSWORD``
     - 32 chars
     - Extractor
     - Default certificate bundle password
   * - ``GRAFANA_PASSWORD``
     - 32 chars
     - Grafana
     - Grafana admin password

Generation commands:

.. code-block:: bash

   openssl rand -hex 24   # 24-byte secrets
   openssl rand -hex 32   # 32-byte secrets

Domain & Routing
----------------

.. list-table::
   :header-rows: 1
   :widths: 25 20 55

   * - Variable
     - Default
     - Description
   * - ``DOMAIN``
     - ``localhost``
     - Primary domain for CORS and SSL
   * - ``API_URL``
     - ``https://localhost``
     - API endpoint URL (used by frontend)
   * - ``FRONTEND_URL``
     - ``https://localhost``
     - Frontend origin
   * - ``PUBLIC_IP``
     - *(empty)*
     - Public IP for CORS
   * - ``CORS_ORIGIN``
     - *(empty)*
     - Comma-separated additional CORS origins
   * - ``USE_LETS_ENCRYPT``
     - ``false``
     - Enable Let's Encrypt certificate provisioning
   * - ``LETSENCRYPT_STAGING``
     - ``false``
     - Use Let's Encrypt staging CA

Runtime Configuration
---------------------

.. list-table::
   :header-rows: 1
   :widths: 30 20 50

   * - Variable
     - Default
     - Description
   * - ``NODE_ENV``
     - ``production``
     - Environment mode
   * - ``ENABLE_DOCKER_LOGS``
     - ``false``
     - Enable Docker log collection (requires Docker socket mount)
   * - ``SIEM_EXPORT_LIMIT``
     - ``1000``
     - Max events per SIEM export
   * - ``SIEM_RATE_LIMIT``
     - ``50``
     - SIEM export rate limit
   * - ``POWERSHELL_TIMEOUT``
     - ``1800000``
     - PowerShell execution timeout (30 min)
   * - ``QUEUE_STALLED_INTERVAL``
     - ``30000``
     - BullMQ stalled job check interval
   * - ``QUEUE_MAX_STALLED_COUNT``
     - ``1``
     - BullMQ max stalled count before fail
   * - ``LOG_LEVEL``
     - ``info``
     - Logging verbosity
   * - ``JWT_EXPIRY``
     - ``24h``
     - JWT token expiration
   * - ``GRAFANA_USER``
     - ``admin``
     - Grafana admin username

Security Notes
--------------

- ``ENABLE_DOCKER_LOGS=false`` keeps the API container unprivileged by default. Set to ``true`` and mount the Docker socket only if you explicitly need container log access.
- ``CORS_ORIGIN`` should be specific in production. Avoid broad values.
- ``SERVICE_AUTH_TOKEN`` must be identical across all service containers.
- No seeded default admin account — you must register the first user.
