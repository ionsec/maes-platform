.. _security-encryption:

Encryption
==========

The platform uses AES-256-CBC encryption for sensitive data at rest.

Implementation
--------------

Source: ``api/src/utils/encryption.js``

The encryption utility uses:

- **Algorithm:** AES-256-CBC
- **Key:** ``ENCRYPTION_KEY`` environment variable (minimum 32 characters)
- **IV:** Random 16-byte initialization vector per encryption operation
- **Format:** ``iv:encryptedData`` (hex-encoded, colon-separated)

What Is Encrypted
-----------------

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Data
     - Storage Location
   * - Organization M365 credentials
     - ``organizations.credentials`` (JSONB)
   * - User-uploaded certificate passwords
     - ``user_certificates`` storage
   * - Service-to-service data
     - Via ``/api/internal/encrypt`` endpoint

Encryption API
--------------

Internal services use the encryption API for operations:

- ``POST /api/internal/encrypt`` — Encrypt data
- ``POST /api/internal/decrypt`` — Decrypt data

Both require ``x-service-token`` authentication.

Key Rotation
------------

To rotate the encryption key:

1. Decrypt all encrypted data with the old key
2. Update ``ENCRYPTION_KEY`` in ``.env``
3. Re-encrypt all data with the new key
4. Restart all services

.. warning::
   Key rotation is a manual process. There is no automated key rotation. Losing the encryption key makes all encrypted data unrecoverable.
