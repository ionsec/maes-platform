.. _architecture-extractor-sidecar:

Extractor Sidecar Service
==========================

The extractor-sidecar is a lightweight Docker container running PowerShell 7 with the `Microsoft-Extractor-Suite <https://github.com/invictus-ir/Microsoft-Extractor-Suite>`_ module. It handles the 5 Exchange-only extraction types that have no Microsoft Graph API equivalent.

Source: ``services/extractor-sidecar/src/index.js``

Why a Sidecar?
--------------

The 5 Exchange-only extraction types (unified audit log, admin audit log, mailbox audit, transport rules, message trace) require Exchange Online PowerShell cmdlets that have no REST API alternative. Rather than keeping the full PowerShell runtime in the main extractor image (~300-500 MB overhead), these types run in a separate sidecar container:

- **Main extractor image**: Pure Node.js on Alpine (~100 MB). No PowerShell, no PowerShell modules.
- **Sidecar image**: PowerShell 7 on Debian with Exchange Online Management and Microsoft-Extractor-Suite modules (~500 MB). Only handles 5 types.

Architecture
------------

.. mermaid::

   flowchart LR
     Extractor[Extractor Service] -->|HTTP POST /api/extract| Sidecar[Sidecar :3001]
     Sidecar -->|Connect-M365| Exchange[Exchange Online]
     Sidecar -->|Connect-MgGraph| Graph[Microsoft Graph]
     Sidecar -->|Write files| Volume[/output volume]
     Extractor -->|Read files| Volume

Supported Extraction Types
---------------------------

.. list-table::
   :header-rows: 1
   :widths: 30 40 30

   * - Type Key
     - PowerShell Cmdlet
     - Data Source
   * - ``unified_audit_log``
     - ``Get-UAL``
     - Exchange Online audit log
   * - ``admin_audit_log``
     - ``Get-AdminAuditLog``
     - Exchange admin audit log
   * - ``mailbox_audit``
     - ``Get-MailboxAuditLog``
     - Per-mailbox audit data
   * - ``transport_rules``
     - ``Get-TransportRules``
     - Exchange transport rules
   * - ``message_trace``
     - ``Get-MessageTraceLog``
     - Message trace log

API Endpoints
-------------

``POST /api/extract``
^^^^^^^^^^^^^^^^^^^^^^

Execute an Exchange-only extraction.

**Request body:**

::

   {
     "type": "unified_audit_log",
     "parameters": {
       "startDate": "2026-01-01",
       "endDate": "2026-01-31",
       "fqdn": "contoso.onmicrosoft.com",
       "tenantId": "xxx"
     },
     "credentials": {
       "applicationId": "xxx",
       "certPath": "/output/app.pfx",
       "certPassword": "xxx"
     },
     "organizationId": "org-123",
     "extractionId": "ext-456"
   }

**Response:**

::

   {
     "success": true,
     "extractionId": "ext-456",
     "statistics": {
       "totalEvents": 1542,
       "uniqueUsers": 87,
       "uniqueOperations": 23
     },
     "output": "..."
   }

``GET /health``
^^^^^^^^^^^^^^^

Health check endpoint. Returns:

::

   { "status": "healthy", "service": "extractor-sidecar", "timestamp": "..." }

Certificate Handling
---------------------

The sidecar receives certificate credentials from the extractor service:

1. ``certPath`` defaults to ``/output/app.pfx`` if not provided
2. ``certPassword`` falls back to ``CERT_PASSWORD`` environment variable if not in the request
3. The sidecar creates an ``X509Certificate2`` object from the PFX file
4. Authentication uses ``Connect-M365`` and ``Connect-MgGraph`` with certificate thumbprint

Docker Configuration
---------------------

The sidecar is defined in ``docker-compose.yml`` as ``extractor-sidecar``:

- **Image**: Built from ``services/extractor-sidecar/Dockerfile``
- **Port**: 3001 (internal only, not exposed to host)
- **Volumes**: Shares ``extractor_output`` and ``user_certificates`` volumes with the extractor
- **Depends on**: Redis and PostgreSQL (health checks)
- **Health check**: HTTP GET to ``/health`` with 60s start period

Environment Variables
---------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``SIDECAR_PORT``
     - HTTP port (default: ``3001``)
   * - ``CERT_PASSWORD``
     - Default certificate password if not provided in request
   * - ``LOG_LEVEL``
     - Winston log level (default: ``info``)
   * - ``NODE_ENV``
     - Environment mode (default: ``production``)
   * - ``POWERSHELL_TIMEOUT``
     - Max PowerShell execution time in ms (default: ``1800000`` = 30 min)
   * - ``QUEUE_STALLED_INTERVAL``
     - BullMQ stalled check interval (default: ``30000``)
   * - ``QUEUE_MAX_STALLED_COUNT``
     - BullMQ max stalled count (default: ``1``)
   * - ``SIDECAR_URL``
     - Self-reference URL (default: ``http://extractor-sidecar:3001``)