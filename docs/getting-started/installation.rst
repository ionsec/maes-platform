.. _installation:

Installation
============

Prerequisites
-------------

- `Docker Engine <https://docs.docker.com/engine/install/>`_ with Compose support (v2+)
- Microsoft 365 tenant credentials for extraction/compliance workflows
- A ``.env`` file with explicit secrets (no default credentials)

Step 1 — Clone the Repository
-----------------------------

.. code-block:: bash

   git clone https://github.com/ionsec/maes-platform.git
   cd maes-platform

Step 2 — Configure Environment
------------------------------

Copy the baseline template and fill in all required secrets:

.. code-block:: bash

   cp .env.example .env

Required secrets (generate with ``openssl rand -hex 24`` or ``openssl rand -hex 32``):

.. list-table::
   :header-rows: 1
   :widths: 30 20 50

   * - Variable
     - Min Length
     - Generation Command
   * - ``POSTGRES_PASSWORD``
     - 24 chars
     - ``openssl rand -hex 24``
   * - ``REDIS_PASSWORD``
     - 24 chars
     - ``openssl rand -hex 24``
   * - ``JWT_SECRET``
     - 32 chars
     - ``openssl rand -hex 32``
   * - ``SERVICE_AUTH_TOKEN``
     - 32 chars
     - ``openssl rand -hex 32``
   * - ``ENCRYPTION_KEY``
     - 32 chars
     - ``openssl rand -hex 32``
   * - ``CERT_PASSWORD``
     - 32 chars
     - ``openssl rand -hex 32``
   * - ``GRAFANA_PASSWORD``
     - 32 chars
     - ``openssl rand -hex 32``

.. important::

   **ENCRYPTION_KEY** must be at least 32 characters.
   **SERVICE_AUTH_TOKEN** must be identical across all internal services.
   The platform will refuse to start if any required secret is missing.

Step 3 — Start the Stack
------------------------

.. code-block:: bash

   docker compose up -d --build

This starts the following services:

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Service
     - Port
     - Description
   * - ``maes-frontend``
     - 80/443
     - React UI behind nginx with SSL termination
   * - ``maes-api``
     - 3000 (internal)
     - API server, auth, orchestration, WebSocket
   * - ``maes-extractor``
     - 3000 (internal)
     - PowerShell extraction worker
   * - ``maes-analyzer``
     - 3000 (internal)
     - Forensic analysis worker
   * - ``maes-compliance``
     - 3002 (internal)
     - Compliance assessment worker
   * - ``maes-postgres``
     - 5432 (internal)
     - PostgreSQL 14 + TimescaleDB
   * - ``maes-redis``
     - 6379 (internal)
     - Redis 7 (cache, queues, token blacklist)
   * - ``maes-prometheus``
     - 9090
     - Metrics collection
   * - ``maes-grafana``
     - 3001
     - Monitoring dashboards
   * - ``maes-loki``
     - 3100
     - Log aggregation
   * - ``maes-promtail``
     - —
     - Log shipper
   * - ``maes-cadvisor``
     - 8080
     - Container metrics

Step 4 — Access the Platform
----------------------------

Open your browser at:

- Local deployment: ``https://localhost``
- Production: ``https://<your-domain>``

.. note::

   Your browser may warn about the self-signed certificate on first visit. Accept it or configure a valid certificate (see :doc:`/deployment/domain-setup`).

Step 5 — Create Your Account
----------------------------

The platform no longer seeds a default administrator account. Register the first user through the MAES UI registration flow. The first user will have ``viewer`` role by default — promote to ``admin`` or ``super_admin`` via the database or API as needed.

Verify the Stack
----------------

.. code-block:: bash

   # Check all containers are running
   docker compose ps

   # Verify API health
   curl -k https://localhost/api/health

   # Check metrics endpoint
   curl -k https://localhost/metrics

Troubleshooting
---------------

**Services fail to start** — Verify all required secrets are set in ``.env``. The API, extractor, analyzer, and compliance services will exit immediately with a clear error message if any required variable is missing.

**Database not ready** — PostgreSQL has a health check. If it fails, inspect logs with ``docker compose logs postgres``.

**Redis connection refused** — Ensure ``REDIS_PASSWORD`` matches across all services. Check with ``docker compose logs redis``.

**Frontend shows blank page** — Make sure ``VITE_API_URL`` is set correctly in the frontend environment. For local dev, it should be ``https://localhost``.
