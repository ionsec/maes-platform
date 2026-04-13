.. _api-system:

System
======

System monitoring and log access. All endpoints require JWT authentication and ``canManageSystemSettings`` permission.

Get System Logs
---------------

.. http:get:: /api/system/logs

   :query container: Container name or ``all`` (default ``all``)
   :query lines: Number of log lines (default ``100``)
   :query since: Time filter (Docker ``--since`` format)
   :query level: Filter by ``info``, ``warning``, ``error``, ``debug``, ``all``
   :query search: Text search in log messages
   :query page: Page number
   :query limit: Items per page

   **Note:** Docker log access requires ``ENABLE_DOCKER_LOGS=true`` and the Docker socket mounted. If disabled, this endpoint returns ``503``.

Get Log Statistics
------------------

.. http:get:: /api/system/logs/stats

   :query since: Timeframe (default ``1h``)

   Returns aggregated statistics: total count, counts by level, counts by container, and the 5 most recent errors.
