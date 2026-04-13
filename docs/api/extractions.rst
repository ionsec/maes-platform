.. _api-extractions:

Extractions
===========

Manage Microsoft 365 data extraction jobs. All endpoints require JWT authentication.

List Extractions
----------------

.. http:get:: /api/extractions

   List extractions for the current organization with pagination and filtering.

   :query page: Page number (default 1)
   :query limit: Items per page (default 20, max 100)
   :query status: Filter by ``pending``, ``running``, ``completed``, ``failed``, ``cancelled``
   :query type: Filter by extraction type key

   **Response 200:**

   .. code-block:: json

      {
        "success": true,
        "extractions": [...],
        "pagination": { "total": 50, "page": 1, "pages": 3, "limit": 20 }
      }

Get Extraction
--------------

.. http:get:: /api/extractions/(id)

   Get details for a single extraction.

Create Extraction
-----------------

.. http:post:: /api/extractions

   Create and queue a new extraction job. Requires ``canManageExtractions`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "type": "unified_audit_log",
        "startDate": "2025-01-01T00:00:00Z",
        "endDate": "2025-01-07T23:59:59Z",
        "priority": "medium",
        "parameters": {
          "filterUsers": ["user@domain.com"],
          "filterOperations": ["UserLoggedIn"],
          "ipAddresses": ["1.2.3.4"],
          "auditDataOnly": false,
          "outputFormat": "JSON"
        }
      }

   - ``type`` must be a valid key from ``shared/platformCapabilities.json``
   - Date range is required for most extraction types
   - ``priority``: ``low``, ``medium`` (default), ``high``, ``critical``

   **Response 201:**

   .. code-block:: json

      {
        "success": true,
        "extraction": { "id": "uuid", "type": "...", "status": "pending" }
      }

Get Extraction Logs
-------------------

.. http:get:: /api/extractions/(id)/logs

   Retrieve real-time log entries for an extraction job from Redis.

Download Extraction
-------------------

.. http:get:: /api/extractions/(id)/download

   Download extraction results as a ZIP archive containing all output files and a ``extraction_metadata.json`` summary. Only available for completed extractions.

Update Extraction Status (Internal)
-----------------------------------

.. http:patch:: /api/extractions/(id)/status

   Internal endpoint used by the extractor service to update job status.

   **Headers:** ``x-service-token: <SERVICE_AUTH_TOKEN>``
