.. _architecture-extractor:

Extractor Service
=================

The extractor service is a BullMQ worker that dequeues extraction jobs from the ``extraction-jobs`` Redis queue. It uses a **dual-path architecture**: native Microsoft Graph API calls for 23 extraction types (Tier 1 & 2), and a PowerShell sidecar for 5 Exchange-only types (Tier 3) that have no Graph API equivalent.

Source: ``services/extractor/src/index.js``

Architecture Overview
---------------------

The extractor dispatches extraction jobs based on type:

.. mermaid::

   flowchart TD
     API[API Service] -->|Enqueue job| Redis[(Redis)]
     Redis -->|Worker picks up| Extractor[Extractor Service]
     Extractor -->|isNativeGraph?| Dispatcher{Extraction Dispatcher}
     Dispatcher -->|Tier 1 & 2: 23 types| GraphAuth[MSAL Graph Auth]
     Dispatcher -->|Tier 3: 5 types| Sidecar[PowerShell Sidecar]
     GraphAuth --> GraphClient[Graph Client Wrapper]
     GraphClient -->|REST API| M365Graph[Microsoft Graph API]
     Sidecar -->|HTTP POST /api/extract| SidecarService[extractor-sidecar:3001]
     SidecarService -->|PowerShell cmdlets| M365Exchange[Exchange Online]
     GraphClient --> Progress[Progress Tracker]
     Sidecar --> Progress
     Progress -->|BullMQ progress| API

Extraction Type Tiers
---------------------

The 28 supported extraction types are divided into three tiers:

Tier 1 — Full Graph API (20 types)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

These types call Microsoft Graph API directly via ``@microsoft/microsoft-graph-client``:

.. list-table::
   :header-rows: 1
   :widths: 30 45 25

   * - Type Key
     - Label
     - Graph Endpoint
   * - ``azure_signin_logs``
     - Entra Sign-In Logs
     - ``/auditLogs/signIns``
   * - ``azure_audit_logs``
     - Entra Audit Logs
     - ``/auditLogs/directoryAudits``
   * - ``mfa_status``
     - MFA Status
     - ``/reports/authenticationMethods/userRegistrationDetails``
   * - ``oauth_permissions``
     - OAuth Permissions
     - ``/servicePrincipals`` + ``/oauth2PermissionGrants``
   * - ``risky_users``
     - Risky Users
     - ``/identityProtection/riskyUsers``
   * - ``risky_detections``
     - Risky Detections
     - ``/identityProtection/riskyDetections``
   * - ``devices``
     - Devices
     - ``/devices`` + ``/deviceManagement/managedDevices``
   * - ``admin_users``
     - Admin Users
     - ``/directoryRoles`` + ``/directoryRoles/{id}/members``
   * - ``conditional_access_policies``
     - Conditional Access Policies
     - ``/identity/conditionalAccess/policies``
   * - ``licenses``
     - Licenses
     - ``/subscribedSkus``
   * - ``licenses_by_user``
     - Licenses by User
     - ``/users?$select=assignedLicenses``
   * - ``license_compatibility``
     - License Compatibility
     - Derived from ``/subscribedSkus``
   * - ``entra_security_defaults``
     - Entra Security Defaults
     - ``/policies/identitySecurityDefaultsEnforcementPolicy``
   * - ``groups``
     - Groups
     - ``/groups``
   * - ``group_members``
     - Group Members
     - ``/groups/{id}/members`` + ``/transitiveMembers``
   * - ``dynamic_groups``
     - Dynamic Groups
     - ``/groups?$filter=groupTypes/any(t:t eq 'DynamicMembership')``
   * - ``pim_assignments``
     - PIM Assignments
     - ``/roleManagement/directory/roleAssignmentSchedules`` + ``roleEligibilitySchedules``
   * - ``role_activity``
     - Role Activity
     - ``/directoryRoles`` + ``/roleManagement/directory/transitiveRoleAssignments``
   * - ``security_alerts``
     - Security Alerts
     - ``/security/alerts_v2``
   * - ``ual_graph``
     - UAL via Graph
     - ``/auditLogs/directoryAudits`` with date filters

Tier 2 — Partial Graph (3 types)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

These types use Graph API where possible but have documented limitations:

.. list-table::
   :header-rows: 1
   :widths: 30 40 30

   * - Type Key
     - Label
     - Limitation
   * - ``mailbox_rules``
     - Mailbox Rules
     - Inbox rules only via Graph; full rules need Exchange
   * - ``mailbox_audit_status``
     - Mailbox Audit Status
     - Partial data via ``/users/{id}/mailboxSettings``
   * - ``mailbox_permissions``
     - Mailbox Permissions
     - No direct Graph API; best-effort or PowerShell fallback

Tier 3 — PowerShell Sidecar (5 types)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

These Exchange-only types have no Graph API equivalent and run via the ``extractor-sidecar`` service:

.. list-table::
   :header-rows: 1
   :widths: 30 40 30

   * - Type Key
     - Label
     - Reason
   * - ``unified_audit_log``
     - Unified Audit Log
     - ``Search-UnifiedAuditLog`` — no Graph equivalent for Exchange/SharePoint/Teams events
   * - ``admin_audit_log``
     - Admin Audit Log
     - Exchange admin audit log has no REST API
   * - ``mailbox_audit``
     - Mailbox Audit
     - Per-mailbox audit data has no Graph API
   * - ``transport_rules``
     - Transport Rules
     - Exchange transport rules have no Graph API
   * - ``message_trace``
     - Message Trace
     - Message trace is Exchange Online only

Key Modules
-----------

Extraction Dispatcher
^^^^^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/extractors/index.js``

Routes extraction jobs to the correct implementation:

- ``dispatchExtraction()`` — Main entry point that checks ``isNativeGraph()`` or ``requiresPowerShell()`` and dispatches accordingly
- ``isNativeGraph(type)`` — Returns true for Tier 1 & 2 types
- ``requiresPowerShell(type)`` — Returns true for Tier 3 Exchange-only types
- ``getNativeTypes()`` / ``getPowerShellTypes()`` — List type keys for each category
- ``full_extraction`` — Composite type that aggregates all non-PowerShell sub-types

Graph Auth Service
^^^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/auth/graphAuth.js``

MSAL-based authentication using ``@azure/msal-node``:

- ``ConfidentialClientApplication`` with certificate-based (PFX) client credentials
- Per-organization client caching with automatic token refresh
- ``getGraphClient(organizationId, credentials)`` — Returns an authenticated ``GraphClientWrapper``
- ``testConnection(graphClient)`` — Tests 4 Graph endpoints for connection validation

Graph Client Wrapper
^^^^^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/clients/graphClient.js``

Wraps ``@microsoft/microsoft-graph-client`` with:

- ``getAllPages(endpoint, options)`` — Automatically follows ``@odata.nextLink`` pagination
- ``getPage(endpoint, options)`` — Single-page requests with OData query support
- ``_requestWithRetry()`` — Exponential backoff with jitter for 429/503 responses (5 retries, 30s base)
- Options: ``select``, ``filter``, ``orderby``, ``top``, ``headers``

Certificate Manager
^^^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/auth/certificateManager.js``

Native PFX/PKCS12 certificate parsing using ``node-forge`` — replaces PowerShell's ``X509Certificate2``:

- ``parsePfxCertificate(buffer, password)`` — Extracts private key, certificate, and thumbprint
- ``validatePfxCertificate(buffer, password)`` — Validates expiry, private key presence, and subject
- ``loadPfxForAuth(buffer, password)`` — Returns PEM-encoded key and cert for MSAL auth

Progress Tracker
^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/utils/progressTracker.js``

Event-driven progress tracking that replaces stdout regex parsing:

- Phase-based progression: ``initializing(5%)`` → ``authenticating(10%)`` → ``fetching(20%)`` → ``paginating(50%)`` → ``writing(85%)`` → ``complete(100%)``
- ``incrementRecords(count)`` — Dynamically scales progress within the fetching/paginating phases
- Updates BullMQ job progress directly via the ``job`` object

Output Writer
^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/utils/outputWriter.js``

File writing with metadata envelope for format detection:

- ``writeJson(filename, data, metadata)`` — Writes JSON with ``{ metadata: { extractionType, extractionId, formatVersion: "2.0", generatedAt, recordCount }, data }``
- ``writeCsv(filename, data, columns)`` — CSV output for tabular data
- ``ensureDir()`` — Creates organization-scoped output directories

PowerShell Adapter
^^^^^^^^^^^^^^^^^^^

**Source:** ``services/extractor/src/adapters/powershellAdapter.js``

HTTP client for the Tier 3 sidecar:

- ``execute(type, parameters, credentials, organizationId, extractionId)`` — POST to ``extractor-sidecar:3001/api/extract``
- ``requiresPowerShell(type)`` — Checks if type is one of the 5 Exchange-only types
- ``healthCheck()`` — GET ``extractor-sidecar:3001/health``
- Timeout handling with ``SIDECAR_TIMEOUT`` environment variable

Certificate Authentication
--------------------------

The extractor uses X.509 certificate authentication for both paths:

1. **Native Graph path**: ``node-forge`` parses the PFX certificate natively, MSAL uses the private key for client credentials flow
2. **PowerShell sidecar path**: The sidecar receives the certificate path and password, PowerShell's ``X509Certificate2`` handles auth

The certificate is mounted from ``/certs`` (default) or uploaded by the user. Organization-scoped output directories prevent cross-tenant data leakage.

Output Structure
----------------

Extraction output is stored in Docker volumes:

::

   /output/
     orgs/
       <organization-id>/
         <extraction-id>/
           azure_signin_logs.json       # Native Graph format (v2.0)
           azure_audit_logs.json
           mfa_status.json
           ...
           extraction_metadata.json

Native Graph extractions produce format version 2.0 output with a metadata envelope:

::

   {
     "metadata": {
       "extractionType": "azure_signin_logs",
       "extractionId": "abc-123",
       "formatVersion": "2.0",
       "format": "native-graph",
       "generatedAt": "2026-05-03T12:00:00Z",
       "recordCount": 1542
     },
     "data": [ ... ]
   }

Tier 3 sidecar extractions use the original PowerShell output format (format version 1.0).

Cleanup API
-----------

The extractor exposes a cleanup API on port 3000 (configurable via ``CLEANUP_PORT``):

- ``DELETE /api/cleanup/organization/:id`` — Remove all extraction data for an organization
- ``GET /health`` — Health check

Environment Variables
---------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``DATABASE_URL``
     - PostgreSQL connection string
   * - ``REDIS_HOST`` / ``REDIS_PORT`` / ``REDIS_PASSWORD``
     - Redis connection for BullMQ
   * - ``JWT_SECRET``
     - JWT signing secret
   * - ``SERVICE_AUTH_TOKEN``
     - Internal service-to-service auth token
   * - ``ENCRYPTION_KEY``
     - Key for encrypting stored credentials (min 32 chars)
   * - ``SIDECAR_URL``
     - URL for the extractor-sidecar service (default: ``http://extractor-sidecar:3001``)
   * - ``POWERSHELL_TIMEOUT``
     - Timeout for sidecar extraction calls (default: 30 minutes)
   * - ``ENABLE_DOCKER_LOGS``
     - Enable Docker log collection (default: ``false``)