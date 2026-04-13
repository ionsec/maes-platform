.. _domain-setup:

Domain Setup & SSL
==================

Custom Domain
-------------

1. Point your domain's DNS A record to the server's public IP.
2. Set ``DOMAIN=your-domain.com`` in ``.env``.
3. The nginx template automatically generates the SSL configuration.

Let's Encrypt
-------------

For automatic SSL certificates:

.. code-block:: bash

   # In .env
   USE_LETS_ENCRYPT=true
   LETSENCRYPT_STAGING=false  # Set to true for testing
   DOMAIN=your-domain.com

The ``ssl/init-letsencrypt.sh`` script handles initial certificate provisioning. After the first certificate is issued, renewal happens automatically via cron inside the container.

Self-Signed Certificate
-----------------------

By default, the platform uses the self-signed certificates in ``certs/app.crt`` and ``certs/app.key``. These are suitable for evaluation but should be replaced in production.

Nginx Configuration
-------------------

The frontend container uses ``frontend/nginx.conf.template`` which is processed with ``envsubst`` at container startup. This allows dynamic configuration of:

- SSL certificate paths
- API proxy target
- Domain name
- CORS headers

Manual Certificate Replacement
------------------------------

1. Place your certificate and key in ``certs/``
2. Update ``CERT_PASSWORD`` if the new certificate has a different password
3. Restart the frontend container: ``docker compose restart frontend``
