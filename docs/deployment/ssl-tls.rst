.. _ssl-tls:

SSL/TLS Configuration
=====================

The platform enforces HTTPS by default. The nginx proxy in the frontend container handles SSL termination.

Default (Self-Signed)
---------------------

The repository includes self-signed certificates in ``certs/``:

- ``app.crt`` — Server certificate
- ``app.key`` — Private key
- ``app.pfx`` — PFX bundle for PowerShell authentication

These are suitable for evaluation and development. Replace them for production.

Let's Encrypt
-------------

.. code-block:: bash

   # 1. Configure .env
   DOMAIN=your-domain.com
   USE_LETS_ENCRYPT=true

   # 2. Run the init script
   ./ssl/init-letsencrypt.sh

   # 3. Restart the frontend
   docker compose restart frontend

Custom Certificates
-------------------

1. Place your certificate pair in ``certs/``:

   - ``app.crt`` (full chain including intermediates)
   - ``app.key`` (unencrypted private key)

2. If using a PFX certificate for extraction, also update:

   - ``app.pfx``
   - ``CERT_PASSWORD`` in ``.env``

3. Restart the frontend:

   .. code-block:: bash

      docker compose restart frontend

Certificate for Microsoft 365 Authentication
--------------------------------------------

The extractor uses certificate-based authentication for Microsoft Graph API. This is separate from the HTTPS server certificate:

- **Server cert** — Used by nginx for HTTPS
- **M365 cert** — Used by PowerShell for Microsoft Graph authentication (stored in ``/certs`` or uploaded via UI)

Both can use the same certificate, but it is recommended to use separate certificates for production.
