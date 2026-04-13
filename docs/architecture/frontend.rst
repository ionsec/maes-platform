.. _architecture-frontend:

Frontend
========

The frontend is a single-page application built with React 19, Material UI, and Vite, served behind an nginx reverse proxy with SSL termination.

Source: ``frontend/``

Tech Stack
----------

=============  ============================
Layer          Technology
=============  ============================
Framework      React 19
UI Library     Material UI (MUI) 7
State          Zustand + React Query
Routing        React Router 7
HTTP Client    Axios
Real-Time      Socket.IO Client
Forms          React Hook Form
Charts         Recharts 3
Build          Vite 7
=============  ============================

Pages
-----

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * - Page
     - File
     - Description
   * - Dashboard
     - ``pages/Dashboard.jsx``
     - Overview with key metrics, charts, and recent activity
   * - Extractions
     - ``pages/Extractions.jsx``
     - Create, monitor, and download extractions
   * - Analysis
     - ``pages/Analysis.jsx``
     - View analysis jobs, findings, and results
   * - Compliance
     - ``pages/Compliance.jsx``
     - Run assessments, view scores, compare results
   * - Alerts
     - ``pages/Alerts.jsx``
     - Triage alerts (acknowledge, assign, resolve)
   * - Reports
     - ``pages/Reports.jsx``
     - Generate and download reports
   * - Settings
     - ``pages/Settings.jsx``
     - Organization credentials, M365 config, certificates
   * - User Management
     - ``pages/UserManagement.jsx``
     - CRUD users, roles, permissions
   * - User Profile
     - ``pages/UserProfile.jsx``
     - Profile editing, certificates, activity log
   * - System Logs
     - ``pages/SystemLogs.jsx``
     - Docker container log viewer (admin only)
   * - SIEM Configuration
     - ``pages/SIEMConfiguration.jsx``
     - Configure SIEM integrations
   * - Login
     - ``pages/Login.jsx``
     - Authentication
   * - Register
     - ``pages/Register.jsx``
     - New user registration
   * - Onboarding
     - ``pages/Onboarding.jsx``
     - First-time organization and M365 setup wizard

Theme Engine
------------

The platform ships with 5 built-in themes:

- **Light** — Default light theme
- **Dark** — Default dark theme
- **Blue** — Blue accent theme
- **Green** — Green accent theme
- **Cyberpunk** — Neon cyberpunk theme

Themes are managed via ``ThemeProvider.jsx`` and selectable through the ``ThemeSelector`` component.

Real-Time Updates
-----------------

The frontend connects to the API via Socket.IO and listens for events scoped to the user's organization:

- ``analysis.started`` / ``analysis.cancelled``
- ``alert.acknowledged`` / ``alert.assigned`` / ``alert.resolved`` / ``alert.deleted``
- ``extraction.progress`` / ``extraction.completed`` / ``extraction.failed``

Nginx Configuration
-------------------

The frontend container runs nginx with:

- SSL termination (self-signed or Let's Encrypt)
- HTTP → HTTPS redirect
- Reverse proxy to API on ``/api/``
- Static file serving for the SPA
- Configurable via ``nginx.conf.template`` with environment variable substitution
