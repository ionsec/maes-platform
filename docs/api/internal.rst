.. _api-internal:

Internal API
============

Internal service-to-service endpoints. All require ``x-service-token`` header matching ``SERVICE_AUTH_TOKEN``.

Encrypt Data
------------

.. http:post:: /api/internal/encrypt

   Encrypt data using the platform encryption key (AES-256-CBC).

   **Request Body:**

   .. code-block:: json

      { "data": "string to encrypt" }

   **Response:**

   .. code-block:: json

      { "success": true, "encrypted": "encrypted-string" }

Decrypt Data
------------

.. http:post:: /api/internal/decrypt

   Decrypt data that was encrypted with the platform encryption key.

   **Request Body:**

   .. code-block:: json

      { "encryptedData": "encrypted-string" }

   **Response:**

   .. code-block:: json

      { "success": true, "decrypted": "original-string" }

Get Docker System Logs
----------------------

.. http:get:: /api/internal/system-logs

   Fetch real logs from Docker containers via ``docker logs`` command.

   :query container: Container name or ``all``
   :query lines: Number of lines
   :query since: Time filter
   :query level: Log level filter
   :query search: Text search

   **Disabled by default.** Requires ``ENABLE_DOCKER_LOGS=true`` and Docker socket mount.

   Returns ``503`` with instructions if Docker log access is disabled.
