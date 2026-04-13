.. _quickstart:

Quick Start Guide
=================

This guide walks you through the fastest path from zero to a working extraction and analysis result.

.. tabs::

   .. tab:: Docker Compose

      1. **Clone and configure:**

      .. code-block:: bash

         git clone https://github.com/ionsec/maes-platform.git
         cd maes-platform
         cp .env.example .env
         # Edit .env — fill in all secrets
         docker compose up -d --build

      2. **Register and configure:**

      - Open ``https://localhost`` → Register
      - Promote your account to admin (see :doc:`first-setup`)
      - Complete onboarding with your M365 tenant ID and Azure AD app credentials

      3. **Run an extraction:**

      - Navigate to Extractions → New Extraction
      - Choose **Unified Audit Log**
      - Set a recent date range (e.g., last 7 days)
      - Submit and watch real-time progress via WebSocket

      4. **Review analysis:**

      - The analyzer runs automatically after extraction completes
      - Check the Analysis page for findings
      - View alerts on the Alerts page

   .. tab:: Local Development

      1. **Start infrastructure:**

      .. code-block:: bash

         docker compose up -d postgres redis

      2. **API server:**

      .. code-block:: bash

         cd api
         npm install
         npm run dev

      3. **Frontend:**

      .. code-block:: bash

         cd frontend
         npm install
         npm run dev

      4. **Services (optional):**

      .. code-block:: bash

         cd services/extractor && npm install && npm start
         cd services/analyzer && npm install && npm start
         cd services/compliance && npm install && npm start

Typical Workflow
----------------

.. mermaid::

   graph LR
     A[Configure M365 Credentials] --> B[Run Extraction]
     B --> C[Auto-Analysis Triggered]
     C --> D[Review Findings & Alerts]
     D --> E[Generate Reports]
     E --> F[Compliance Assessment]
     F --> G[Remediate & Re-Assess]

Next Steps
----------

- :doc:`/architecture/overview` — understand the system design
- :doc:`/api/authentication` — authenticate with the API
- :doc:`/deployment/environment-variables` — configure all options
- :doc:`/security/rbac` — understand roles and permissions
