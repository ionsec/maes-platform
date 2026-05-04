.. _migration-graph-api:

Migration: PowerShell to Native Graph API
==========================================

Starting in v1.3.0, the MAES extractor service uses native Microsoft Graph API calls for 23 of 28 extraction types, eliminating the PowerShell runtime dependency from the main extractor container. This migration reduces the extractor Docker image by ~300-500 MB and replaces fragile stdout regex parsing with event-driven progress tracking.

What Changed
-------------

Before v1.3.0, **all 28 extraction types** spawned a ``pwsh`` child process running Microsoft-Extractor-Suite cmdlets. The extractor Dockerfile included PowerShell 7, 10+ Microsoft modules, and a startup script.

After v1.3.0:

- **23 types** (Tier 1 & 2) call Microsoft Graph API directly via ``@azure/msal-node`` and ``@microsoft/microsoft-graph-client``
- **5 types** (Tier 3) route to a lightweight ``extractor-sidecar`` HTTP API that still runs PowerShell
- The main extractor Dockerfile drops from ~103 lines (with PowerShell install) to ~40 lines (pure Node.js Alpine)

New Dependencies
^^^^^^^^^^^^^^^^

The extractor package now includes:

- ``@azure/msal-node`` — Certificate-based client credentials authentication
- ``@microsoft/microsoft-graph-client`` — Graph SDK with pagination and query support
- ``node-forge`` — Native PFX/PKCS12 certificate parsing (replaces PowerShell's ``X509Certificate2``)

The API service also uses ``node-forge`` for certificate validation, eliminating the PowerShell dependency from the cert upload flow.

Output Format Changes
---------------------

Native Graph extractions produce **format version 2.0** output with a metadata envelope:

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
     "data": [
       { "@odata.type": "#microsoft.graph.signIn", "id": "...", ... }
     ]
   }

Tier 3 sidecar extractions continue to produce **format version 1.0** (raw PowerShell output without the metadata envelope). The analyzer service detects format version from the ``metadata`` field and handles both formats.

Connection Test Changes
-----------------------

The connection test flow no longer spawns PowerShell. Instead, it uses the native Graph auth service:

1. ``graphAuthService.testConnection(graphClient)`` tests 4 Graph endpoints
2. Verifies the app has permissions for ``organization``, ``users``, ``conditionalAccess``, and ``directoryRoles``
3. Returns detailed results including which permissions passed/failed

Certificate Validation Changes
-------------------------------

Certificate upload and validation in the API service (``api/src/routes/user.js``) now uses ``node-forge`` instead of spawning ``pwsh``:

- ``forge.asn1.fromDer()`` + ``forge.pkcs12.pkcs12FromAsn1()`` parse the PFX natively
- Thumbprint is calculated via ``crypto.createHash('sha1')`` on the DER-encoded certificate
- Validates private key presence, expiry dates, and subject/issuer

This eliminates the PowerShell dependency from the API service entirely.

Progress Tracking Changes
--------------------------

**Before**: PowerShell process stdout was captured and parsed via regex patterns (``Total Events:```, ``Unique Users:```, etc.)

**After**: ``ProgressTracker`` class emits phase-based events:

- ``initializing`` (5%) — Setting up extractor
- ``authenticating`` (10%) — MSAL token acquisition
- ``fetching`` (20%) — First page of data
- ``paginating`` (50%) — Following @odata.nextLink
- ``writing`` (85%) — Writing output files
- ``complete`` (100%) — Extraction finished

Progress updates flow directly to BullMQ job progress instead of polling ``LogFile.txt``.

Docker Compose Changes
----------------------

The ``docker-compose.yml`` now includes:

- **``extractor-sidecar``** service: PowerShell 7 container with Microsoft-Extractor-Suite
- **``SIDECAR_URL``** environment variable on the extractor service (default: ``http://extractor-sidecar:3001``)
- Shared ``extractor_output`` and ``user_certificates`` volumes between extractor and sidecar

Migration Path for Existing Deployments
----------------------------------------

1. Pull the latest code and rebuild Docker images
2. The sidecar starts automatically with ``docker compose up -d --build``
3. Existing extractions will use the appropriate path (native Graph or sidecar) based on type
4. No data migration needed — both output formats are supported by the analyzer

Backward Compatibility
-----------------------

- **Legacy PowerShell path**: If a type is not recognized as native Graph or sidecar, the old ``buildPowerShellCommand`` + ``executePowerShell`` path remains as a fallback. This ensures no extraction type breaks during transition.
- **Output format**: The analyzer service handles both format version 1.0 (PowerShell) and 2.0 (native Graph) based on the ``metadata`` field presence.
- **Environment variables**: All existing environment variables continue to work. New variables (``SIDECAR_URL``, ``POWERSHELL_TIMEOUT``) have sensible defaults.

Future Work
-----------

- **Exchange REST API**: As Microsoft adds REST API alternatives for Exchange-only cmdlets, Tier 3 types can be migrated to native Graph, eventually eliminating the sidecar entirely.
- **Sidecar slimming**: The sidecar image can be further optimized by pre-installing only the required modules.
- **Analyzer updates**: The analyzer can be updated to natively consume Graph API format without PowerShell output parsing.