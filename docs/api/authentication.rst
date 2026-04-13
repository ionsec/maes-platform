.. _api-authentication:

Authentication
==============

All authenticated API endpoints require a JWT token in the ``Authorization: Bearer <token>`` header.

Login
-----

.. http:post:: /api/auth/login

   Authenticate a user and receive a JWT token.

   **Request Body:**

   .. code-block:: json

      {
        "username": "string (required)",
        "password": "string (required, min 6 chars)"
      }

   **Response 200:**

   .. code-block:: json

      {
        "success": true,
        "token": "eyJhbGci...",
        "user": {
          "id": "uuid",
          "email": "user@example.com",
          "username": "jdoe",
          "role": "admin",
          "needsOnboarding": false
        }
      }

   **Error Responses:**

   - ``400`` — Validation error
   - ``401`` — Invalid credentials
   - ``403`` — Organization inactive
   - ``423`` — Account locked (5 failed attempts → 30 min lockout)

Account Lockout
^^^^^^^^^^^^^^^

- After 5 consecutive failed login attempts, the account is locked for 30 minutes.
- Successful login resets the counter.
- Failed login attempts are recorded in the audit log.

Admin Consent
-------------

.. http:get:: /api/auth/callback

   Handles the Microsoft admin consent redirect. After a tenant admin grants permissions, Microsoft redirects here with a ``tenant`` and ``admin_consent`` parameter.

   This endpoint is used during the registration flow to link a Microsoft 365 tenant to a MAES organization.

Logout
------

.. http:post:: /api/auth/logout

   Invalidate the current JWT token by adding its SHA-256 hash to a Redis blacklist with TTL matching the token expiry.

   **Headers:** ``Authorization: Bearer <token>``

   **Response 200:**

   .. code-block:: json

      {
        "success": true,
        "message": "Logged out successfully"
      }

JWT Structure
-------------

The JWT payload contains:

.. code-block:: json

   {
     "userId": "uuid",
     "organizationId": "uuid",
     "role": "admin|analyst|viewer",
     "iat": 1700000000,
     "exp": 1700086400
   }

Default expiry: **24 hours** (configurable via ``JWT_EXPIRY``).

Service Authentication
----------------------

Internal service-to-service calls use the ``x-service-token`` header with the shared ``SERVICE_AUTH_TOKEN`` secret. This bypasses JWT authentication and is used by:

- Extractor → API (status updates, analysis triggers)
- Analyzer → API (alert creation, job updates)
- Compliance → API (assessment results)
- API → Internal (encryption/decryption, system logs)
