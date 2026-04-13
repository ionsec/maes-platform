.. _testing:

Testing
=======

Test Frameworks
---------------

- **API:** Jest + Supertest
- **Frontend:** Build verification (``npm run build``)
- **Dependency audit:** ``npm audit --omit=dev``

Running Tests
-------------

.. code-block:: bash

   # API unit tests
   cd api && npm test

   # Frontend build verification
   cd frontend && npm run build

   # Lint all services
   cd api && npm run lint
   cd frontend && npm run lint

   # Security audit all services
   cd api && npm audit --omit=dev
   cd frontend && npm audit --omit=dev
   cd services/extractor && npm audit --omit=dev
   cd services/analyzer && npm audit --omit=dev
   cd services/compliance && npm audit --omit=dev

Database Testing
----------------

.. code-block:: bash

   # Run migration tests
   ./database/test-migrations.sh

Integration Testing
-------------------

For end-to-end verification:

1. Start the full stack: ``docker compose up -d --build``
2. Verify health: ``curl https://localhost/api/health``
3. Register a user and test the workflow
4. Check container logs: ``docker compose logs -f``
5. Verify monitoring: ``curl https://localhost:3001`` (Grafana)
