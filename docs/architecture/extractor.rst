.. _architecture-extractor:

Extractor Service
=================

The extractor service is a BullMQ worker that dequeues extraction jobs from the ``extraction-jobs`` Redis queue and executes PowerShell cmdlets from the `Microsoft-Extractor-Suite <https://github.com/invictus-ir/Microsoft-Extractor-Suite>`_.

Source: ``services/extractor/src/index.js``

How It Works
-------------

.. mermaid::

   sequenceDiagram
     participant API
     participant Redis
     participant Extractor
     participant PowerShell
     participant M365

     API->>Redis: Enqueue extraction job
     Redis-->>Extractor: Worker picks up job
     Extractor->>Extractor: Build PowerShell command
     Extractor->>PowerShell: Spawn process
     PowerShell->>M365: Authenticate + Run cmdlet
     M365-->>PowerShell: Return data
     PowerShell-->>Extractor: Write output files
     Extractor->>Redis: Stream progress (LogFile.txt monitor)
     Extractor->>API: PATCH /api/extractions/:id/status (completed)
     Extractor->>Redis: Enqueue analysis job (auto-trigger)

Extraction Types
-----------------

The supported extraction types are defined in ``shared/platformCapabilities.json`` and used across all services:

.. list-table::
   :header-rows: 1
   :widths: 25 30 20 25

   * - Type Key
     - Label
     - Date Range
     - Analysis Support
   * - ``unified_audit_log``
     - Unified Audit Log
     - Yes
     - ual_analysis
   * - ``azure_signin_logs``
     - Entra Sign-In Logs
     - Yes
     - signin_analysis
   * - ``azure_audit_logs``
     - Entra Audit Logs
     - Yes
     - audit_analysis
   * - ``admin_audit_log``
     - Admin Audit Log
     - Yes
     - audit_analysis
   * - ``mailbox_audit``
     - Mailbox Audit
     - Yes
     - audit_analysis
   * - ``message_trace``
     - Message Trace
     - Yes
     - message_trace_analysis
   * - ``oauth_permissions``
     - OAuth Permissions
     - No
     - oauth_analysis
   * - ``mfa_status``
     - MFA Status
     - No
     - mfa_analysis
   * - ``risky_users``
     - Risky Users
     - No
     - risky_user_analysis
   * - ``risky_detections``
     - Risky Detections
     - Yes
     - risky_detection_analysis
   * - ``devices``
     - Devices
     - No
     - device_analysis
   * - ``ual_graph``
     - UAL via Graph
     - Yes
     - ual_analysis
   * - ``licenses``
     - Licenses
     - No
     - comprehensive_analysis
   * - ``mailbox_rules``
     - Mailbox Rules
     - No
     - —
   * - ``transport_rules``
     - Transport Rules
     - No
     - —
   * - ``activity_logs``
     - Azure Activity Logs
     - Yes
     - audit_analysis
   * - ``directory_activity_logs``
     - Directory Activity Logs
     - Yes
     - audit_analysis
   * - ``admin_users``
     - Admin Users
     - No
     - risky_user_analysis
   * - ``conditional_access_policies``
     - Conditional Access Policies
     - No
     - audit_analysis
   * - ``mailbox_audit_status``
     - Mailbox Audit Status
     - No
     - —
   * - ``mailbox_permissions``
     - Mailbox Permissions
     - No
     - —
   * - ``licenses_by_user``
     - Licenses by User
     - No
     - comprehensive_analysis
   * - ``license_compatibility``
     - License Compatibility
     - No
     - —
   * - ``entra_security_defaults``
     - Entra Security Defaults
     - No
     - —
   * - ``groups``
     - Groups
     - No
     - —
   * - ``group_members``
     - Group Members
     - No
     - —
   * - ``dynamic_groups``
     - Dynamic Groups
     - No
     - —
   * - ``pim_assignments``
     - PIM Assignments
     - No
     - —
   * - ``role_activity``
     - Role Activity
     - No
     - —
   * - ``security_alerts``
     - Security Alerts
     - No
     - audit_analysis
   * - ``full_extraction``
     - Full Extraction
     - Yes
     - comprehensive_analysis

Certificate Authentication
----------------------------

The extractor uses X.509 certificate authentication to connect to Microsoft 365:

1. The certificate is mounted from ``/certs`` (default) or uploaded by the user
2. The certificate password is provided via ``CERT_PASSWORD`` env var
3. PowerShell commands use ``ConvertTo-SecureString`` with the certificate thumbprint
4. Organization-scoped output directories prevent cross-tenant data leakage

Output Structure
-----------------

Extraction output is stored in Docker volumes:

::

   /output/
     orgs/
       <organization-id>/
         <extraction-id>/
           UAL_*.json
           LogFile.txt
           extraction_metadata.json

Cleanup API
-----------

The extractor exposes a cleanup API on port 3000 (configurable via ``CLEANUP_PORT``):

- ``DELETE /api/cleanup/organization/:id`` — Remove all extraction data for an organization
- ``GET /health`` — Health check
