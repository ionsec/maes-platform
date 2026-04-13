.. _deployment-docker-compose:

Docker Compose Deployment
=========================

The primary deployment method is ``docker compose``. The platform ships three compose files:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - File
     - Purpose
   * - ``docker-compose.yml``
     - Production deployment (default)
   * - ``docker-compose.dev.yml``
     - Development overrides (exposed ports, debug flags)
   * - ``docker-compose.prod.yml``
     - Production overrides (resource limits, replicas)

Starting the Stack
------------------

.. code-block:: bash

   # Production
   docker compose up -d --build

   # Development (exposes API port 3000, hot reload)
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

Service Dependencies
--------------------

.. mermaid::

   graph TD
     Frontend --> API
     API --> Postgres
     API --> Redis
     Extractor --> Postgres
     Extractor --> Redis
     Analyzer --> Postgres
     Analyzer --> Redis
     Compliance --> Postgres
     Compliance --> Redis
     Prometheus --> API
     Prometheus --> Extractor
     Prometheus --> Analyzer
     Grafana --> Prometheus
     Promtail --> Loki
     cAdvisor --> Docker

Health checks are configured for PostgreSQL and Redis. The API, extractor, analyzer, and compliance services depend on both being healthy before starting.

Docker Volumes
--------------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Volume
     - Contents
   * - ``postgres_data``
     - PostgreSQL data directory
   * - ``redis_data``
     - Redis persistence
   * - ``extractor_output``
     - PowerShell extraction output files
   * - ``analyzer_output``
     - Analyzer output files
   * - ``prometheus_data``
     - Prometheus time-series data
   * - ``grafana_data``
     - Grafana dashboards and settings
   * - ``loki_data``
     - Loki log storage
   * - ``user_certificates``
     - User-uploaded PFX certificates
   * - ``compliance-reports``
     - Generated compliance report files

Network
-------

All services run on the ``maes-network`` bridge network. Only the frontend exposes external ports (80/443). All other services communicate internally.

Image Pinning
-------------

All container base images are pinned by SHA256 digest to prevent supply chain attacks. See the ``Dockerfile`` in each service directory.
