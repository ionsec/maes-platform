.. _api-upload:

Upload
======

Upload Microsoft 365 log data for analysis. Supports JSON, CSV, TXT, and LOG files.

Upload File
-----------

.. http:post:: /api/upload/logs

   Upload a log file and automatically trigger analysis. Requires ``canManageExtractions`` permission.

   **Content-Type:** ``multipart/form-data``

   **Form Fields:**

   - ``file`` — The log file (max 50 MB, up to 5 files per request)
   - ``dataType`` — Extraction type key (e.g., ``unified_audit_log``)
   - ``metadata`` — Optional JSON metadata

   **Allowed file types:** ``.json``, ``.csv``, ``.txt``, ``.log``

   **Security checks:**

   - MIME type validation
   - File extension validation
   - Path traversal detection
   - Suspicious filename patterns
   - File size limit (50 MB)

   **Response 201:**

   .. code-block:: json

      {
        "success": true,
        "extraction": {
          "id": "uuid",
          "type": "unified_audit_log",
          "status": "completed",
          "itemsExtracted": 1500,
          "isUpload": true
        },
        "analysisJob": {
          "id": "uuid",
          "type": "ual_analysis",
          "status": "pending",
          "message": "Analysis job automatically started"
        }
      }

   Upload automatically creates an extraction record and queues an analysis job.

Get Uploaded Data (Internal)
----------------------------

.. http:get:: /api/upload/data/(extractionId)

   Internal service endpoint. Returns the uploaded audit data for the analyzer service.

   **Headers:** ``x-service-token: <SERVICE_AUTH_TOKEN>``

List Uploaded Extractions
-------------------------

.. http:get:: /api/upload/extractions

   List uploaded extractions for the current organization.

Cleanup
-------

Uploaded files are automatically cleaned up after 24 hours. The extraction record and in-memory cache are removed.
