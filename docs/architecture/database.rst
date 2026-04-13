.. _architecture-database:

Database Schema
===============

The MAES platform uses PostgreSQL 14 with TimescaleDB on the ``maes`` schema.

Schema: ``maes``
------------------

All tables live in the ``maes`` schema. The database is initialized from ``database/init.sql`` and subsequent migrations in ``database/migrations/``.

Entity-Relationship Overview
------------------------------

.. mermaid::

   erDiagram
     organizations ||--o{ users : "has"
     organizations ||--o{ extractions : "has"
     organizations ||--o{ analysis_jobs : "has"
     organizations ||--o{ alerts : "has"
     organizations ||--o{ audit_logs : "has"
     organizations ||--o{ compliance_assessments : "has"
     organizations ||--o{ compliance_schedules : "has"
     users ||--o{ extractions : "triggered_by"
     extractions ||--o{ analysis_jobs : "produces"
     compliance_assessments ||--o{ compliance_results : "has"
     compliance_controls ||--o{ compliance_results : "evaluated_in"
     users ||--o{ user_organizations : "has"

Core Tables
------------

organizations
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - id
     - UUID (PK)
     - Auto-generated
   * - name
     - VARCHAR(255)
     - Organization name
   * - tenant_id
     - VARCHAR(255) UNIQUE
     - Microsoft 365 tenant ID
   * - fqdn
     - VARCHAR(255)
     - Fully qualified domain name
   * - organization_type
     - VARCHAR(50)
     - ``mssp``, ``client``, ``standalone``
   * - settings
     - JSONB
     - Organization settings
   * - credentials
     - JSONB
     - Encrypted M365 credentials
   * - is_active
     - BOOLEAN
     - Active flag
   * - offboard_scheduled_at
     - TIMESTAMP TZ
     - Scheduled deletion time

users
^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - id
     - UUID (PK)
     - Auto-generated
   * - organization_id
     - UUID (FK)
     - Primary organization
   * - email
     - VARCHAR(255) UNIQUE
     - User email
   * - username
     - VARCHAR(50) UNIQUE
     - Login username
   * - password
     - VARCHAR(255)
     - bcrypt hash
   * - role
     - user_role ENUM
     - ``admin``, ``analyst``, ``viewer``
   * - permissions
     - JSONB
     - Granular permission overrides
   * - mfa_enabled
     - BOOLEAN
     - MFA flag
   * - is_active
     - BOOLEAN
     - Active flag
   * - login_attempts
     - INTEGER
     - Failed login counter
   * - locked_until
     - TIMESTAMP TZ
     - Lockout expiry

user_organizations
^^^^^^^^^^^^^^^^^^

Multi-organization membership:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - user_id
     - UUID (FK)
     - User reference
   * - organization_id
     - UUID (FK)
     - Organization reference
   * - role
     - TEXT
     - Role in this org
   * - permissions
     - JSONB
     - Org-scoped permissions
   * - is_primary
     - BOOLEAN
     - Primary org flag

extractions
^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - id
     - UUID (PK)
     - Auto-generated
   * - organization_id
     - UUID (FK)
     - Owner org
   * - type
     - extraction_type ENUM
     - See :doc:`/architecture/extractor`
   * - status
     - job_status ENUM
     - ``pending``, ``running``, ``completed``, ``failed``, ``cancelled``
   * - priority
     - priority_level ENUM
     - ``low``, ``medium``, ``high``, ``critical``
   * - start_date / end_date
     - TIMESTAMP TZ
     - Date range for extraction
   * - progress
     - INTEGER (0–100)
     - Progress percentage
   * - items_extracted
     - INTEGER
     - Total items extracted
   * - parameters
     - JSONB
     - Extraction parameters
   * - output_files
     - JSONB
     - Output file metadata array
   * - error_message / error_details
     - TEXT / JSONB
     - Error information

analysis_jobs
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - id
     - UUID (PK)
     - Auto-generated
   * - extraction_id
     - UUID (FK)
     - Parent extraction
   * - organization_id
     - UUID (FK)
     - Owner org
   * - type
     - VARCHAR(100)
     - Analysis type
   * - status
     - job_status ENUM
     - Job status
   * - results
     - JSONB
     - Findings, statistics, recommendations
   * - alerts
     - JSONB
     - Generated alerts array

alerts
^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Column
     - Type
     - Description
   * - id
     - UUID (PK)
     - Auto-generated
   * - organization_id
     - UUID (FK)
     - Owner org
   * - severity
     - alert_severity ENUM
     - ``low``, ``medium``, ``high``, ``critical``
   * - category
     - VARCHAR(50)
     - Alert category
   * - title / description
     - VARCHAR / TEXT
     - Alert details
   * - status
     - alert_status ENUM
     - ``new``, ``acknowledged``, ``investigating``, ``resolved``, ``false_positive``
   * - affected_entities
     - JSONB
     - Affected users/resources
   * - evidence
     - JSONB
     - Supporting evidence
   * - mitre_techniques
     - JSONB
     - MITRE ATT&CK mapping

audit_logs
^^^^^^^^^^

Immutable audit trail for all security-relevant actions (login, logout, CRUD operations).

Compliance Tables
------------------

compliance_assessments
^^^^^^^^^^^^^^^^^^^^^^

Stores assessment metadata, scores, and status. Key columns:

- ``assessment_type``: ``cis_v400``, ``cis_v300``, ``custom``, ``orca_style``
- ``compliance_score`` / ``weighted_score``: 0–100
- ``compliant_controls``, ``non_compliant_controls``, etc.
- ``is_baseline``: Flag for initial assessment comparison

compliance_controls
^^^^^^^^^^^^^^^^^^^

CIS benchmark control definitions:

- ``control_id``: CIS control identifier (e.g., ``1.1.1``)
- ``section``: Control section
- ``severity``: ``level1`` or ``level2``
- ``weight``: Scoring weight
- ``graph_api_endpoint`` / ``check_method``: Automated check metadata

compliance_results
^^^^^^^^^^^^^^^^^^

Per-control evaluation result:

- ``status``: ``compliant``, ``non_compliant``, ``manual_review``, ``not_applicable``, ``error``
- ``score``: 0–100
- ``actual_result`` / ``expected_result``: JSONB comparison data
- ``evidence``: Collected evidence
- ``remediation_guidance``: Actionable steps

compliance_schedules
^^^^^^^^^^^^^^^^^^^^^

Scheduled assessment configuration with ``frequency`` (daily/weekly/monthly/quarterly).

Migrations
-----------

Migrations are numbered and stored in ``database/migrations/``:

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - #
     - Description
   * - 001
     - Initial schema (all core tables)
   * - 002
     - Add error_details to analysis_jobs
   * - 003
     - Add graph extraction types to enum
   * - 004
     - Add user_organizations multi-tenancy
   * - 005
     - Add organization offboarding fields
   * - 006
     - Add compliance assessment tables
   * - 007
     - Load CIS v4.0.0 controls
   * - 008
     - Create compliance_reports table
   * - 009–010
     - Add compliance permissions
   * - 011
     - Add error_details column
   * - 012
     - Simplify RBAC roles
   * - 013
     - Expand extraction_type enum
