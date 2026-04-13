.. _api-siem:

SIEM Integration
================

Configure and manage SIEM integrations for security event export. All endpoints require JWT authentication.

List Configurations
-------------------

.. http:get:: /api/siem/configurations

   List all SIEM configurations for the current organization. Requires ``canViewSettings`` permission.

Create Configuration
--------------------

.. http:post:: /api/siem/configurations

   Create a new SIEM configuration. Requires ``canEditSettings`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "name": "Primary Splunk Instance",
        "type": "splunk",
        "endpoint": "https://splunk.example.com:8088/services/collector",
        "apiKey": "hec-token",
        "format": "json",
        "enabled": true,
        "exportFrequency": "hourly"
      }

   **Supported SIEM types:** ``splunk``, ``qradar``, ``elasticsearch``, ``generic``
   **Supported formats:** ``json``, ``cef``, ``xml``, ``csv``
   **Supported frequencies:** ``manual``, ``hourly``, ``daily``, ``weekly``

Update Configuration
--------------------

.. http:put:: /api/siem/configurations/(id)

   Update an existing SIEM configuration. Requires ``canEditSettings`` permission.

Delete Configuration
--------------------

.. http:delete:: /api/siem/configurations/(id)

   Delete a SIEM configuration. Requires ``canEditSettings`` permission.

Test Connection
---------------

.. http:post:: /api/siem/configurations/(id)/test

   Test the connection to a SIEM endpoint.

Export Security Events
----------------------

.. http:get:: /api/siem/export

   Export security events in the specified format.

   :query format: ``json``, ``csv``, ``cef``, ``xml``
   :query startDate: Start date (ISO 8601)
   :query endDate: End date (ISO 8601)
   :query severity: Filter by severity
   :query limit: Max events (default 1000, from ``SIEM_EXPORT_LIMIT``)

   **Output formats:**

   - **JSON** — Standard structured event data
   - **CEF** — Common Event Format for SIEM ingestion
   - **CSV** — Comma-separated values
   - **XML** — XML-formatted events

   **Splunk format** includes: ``_time``, ``_raw``, ``sourcetype``, ``source``, ``host``, ``index``
   **QRadar format** includes: ``qid``, ``magnitude``, ``credibility``, ``relevance``, ``starttime``
