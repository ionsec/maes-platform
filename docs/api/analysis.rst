.. _api-analysis:

Analysis
========

Manage forensic analysis jobs. All endpoints require JWT authentication unless noted.

List Analysis Jobs
------------------

.. http:get:: /api/analysis

   List analysis jobs for the current organization.

   :query page: Page number (default 1)
   :query limit: Items per page (default 20, max 100)
   :query status: Filter by status
   :query type: Filter by analysis type

Create Analysis Job
-------------------

.. http:post:: /api/analysis

   Create and queue a new analysis job. Requires ``canRunAnalysis`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "extractionId": "uuid",
        "type": "ual_analysis",
        "priority": "medium",
        "parameters": {
          "enableThreatIntel": true,
          "enablePatternDetection": true,
          "enableAnomalyDetection": false
        }
      }

   - ``type`` must match the analysis type for the extraction type (see platformCapabilities.json)
   - ``extractionId`` must reference a completed extraction

Create Internal Analysis Job
----------------------------

.. http:post:: /api/analysis/internal

   Service-to-service endpoint for auto-triggered analysis. Uses ``x-service-token`` authentication instead of JWT.

   **Headers:** ``x-service-token: <SERVICE_AUTH_TOKEN>``

   **Request Body:**

   .. code-block:: json

      {
        "extractionId": "uuid",
        "type": "ual_analysis",
        "priority": "medium",
        "parameters": {}
      }

Create Direct Analysis Record
-----------------------------

.. http:post:: /api/analysis/internal/direct

   Fallback endpoint that creates an analysis job record directly in the database. Used when the normal internal endpoint fails.

   **Headers:** ``x-service-token: <SERVICE_AUTH_TOKEN>``

Get Analysis Results
--------------------

.. http:get:: /api/analysis/(id)/results

   Retrieve the results of a completed analysis job.

   **Response 200:**

   .. code-block:: json

      {
        "success": true,
        "results": {
          "summary": {...},
          "findings": [...],
          "statistics": {...},
          "recommendations": [...]
        },
        "alerts": [...],
        "outputFiles": [...]
      }

Cancel Analysis Job
-------------------

.. http:post:: /api/analysis/(id)/cancel

   Cancel a pending or running analysis job. Requires ``canRunAnalysis`` permission.
