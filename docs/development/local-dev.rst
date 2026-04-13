.. _local-dev:

Local Development
=================

Prerequisites
-------------

- Node.js >= 20.0.0
- Docker and Docker Compose (for infrastructure services)
- Git

Start Infrastructure
--------------------

Run only the stateful services in Docker:

.. code-block:: bash

   docker compose up -d postgres redis

This provides PostgreSQL on ``localhost:5432`` and Redis on ``localhost:6379``.

Environment
-----------

Create a ``.env`` file (or set environment variables directly):

.. code-block:: bash

   DATABASE_URL=postgresql://maes_user:yourpassword@localhost:5432/maes_db
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=yourpassword
   JWT_SECRET=dev-jwt-secret-at-least-32-chars-long
   SERVICE_AUTH_TOKEN=dev-service-token-at-least-32-chars
   ENCRYPTION_KEY=dev-encryption-key-at-least-32-chars
   NODE_ENV=development

API Server
----------

.. code-block:: bash

   cd api
   npm install
   npm run dev    # Starts nodemon with auto-reload

The API runs on ``http://localhost:3000`` with Swagger at ``http://localhost:3000/api/docs``.

Frontend
--------

.. code-block:: bash

   cd frontend
   npm install
   npm run dev    # Starts Vite dev server with HMR

The frontend runs on ``http://localhost:5173`` (default Vite port) and proxies API requests to ``localhost:3000``.

Services
--------

Each service can be run independently:

.. code-block:: bash

   # Extractor
   cd services/extractor && npm install && npm start

   # Analyzer
   cd services/analyzer && npm install && npm start

   # Compliance
   cd services/compliance && npm install && npm start

Database Migrations
-------------------

.. code-block:: bash

   cd api
   npm run migrate          # Run pending migrations
   npm run migrate:status   # Show migration status

Or use the migration script directly:

.. code-block:: bash

   node src/utils/migrate.js run
   node src/utils/migrate.js status

CORS in Development
-------------------

In development mode (``NODE_ENV=development``), the API accepts requests from:

- ``https://localhost``
- ``http://localhost:8080``
- ``http://localhost``
- ``http://localhost:3000``
- ``https://localhost:3000``

Additional origins can be set via ``CORS_ORIGIN``.
