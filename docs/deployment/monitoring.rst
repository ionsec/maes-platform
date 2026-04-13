.. _deployment-monitoring:

Monitoring
==========

The platform includes a full monitoring stack: Prometheus for metrics, Grafana for dashboards, Loki for log aggregation, and cAdvisor for container metrics.

Prometheus
----------

- **Port:** 9090
- **Config:** ``monitoring/prometheus.yml``
- **Scrape targets:** API (``/metrics``), Extractor, Analyzer
- **Retention:** 30 days
- **External URL:** ``https://localhost/prometheus/``

Grafana
-------

- **Port:** 3001
- **Admin user:** Configurable via ``GRAFANA_USER`` (default: ``admin``)
- **Admin password:** ``GRAFANA_PASSWORD`` (required)
- **Pre-provisioned:** Datasource (Prometheus) and dashboard (MAES Overview)
- **External URL:** ``https://localhost/grafana/``

The default ``maes-overview`` dashboard includes:

- API request rates and latency
- Extraction job throughput
- Analysis job duration
- Alert volume by severity
- System resource utilization

Loki
----

- **Port:** 3100
- **Config:** ``monitoring/loki-config.yml``
- Log aggregation backend for Grafana Explore

Promtail
--------

- **Config:** ``monitoring/promtail-config.yml``
- Ships Docker container logs and host logs to Loki
- Reads from ``/var/lib/docker/containers``

cAdvisor
--------

- **Port:** 8080
- Container resource metrics (CPU, memory, network, filesystem)
- Scraped by Prometheus

API Metrics
-----------

The API server exposes Prometheus metrics at ``GET /metrics``:

- ``http_requests_total`` — Total HTTP requests by method, route, status
- ``http_request_duration_seconds`` — Request latency histogram

Quick Reference
---------------

.. list-table::
   :header-rows: 1
   :widths: 25 25 50

   * - Service
     - URL
     - Purpose
   * - Prometheus
     - ``https://localhost:9090``
     - Metrics query and alerting
   * - Grafana
     - ``https://localhost:3001``
     - Dashboards and visualization
   * - Loki
     - ``https://localhost:3100``
     - Log query API
   * - cAdvisor
     - ``https://localhost:8080``
     - Container metrics UI
   * - API Metrics
     - ``https://localhost/metrics``
     - Prometheus scrape target
