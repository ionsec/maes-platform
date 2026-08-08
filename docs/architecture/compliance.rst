.. _architecture-compliance:

Compliance Service
==================

The compliance service evaluates Microsoft 365 tenant configurations against benchmark and posture control sets, using the Microsoft Graph API with certificate-based authentication.

Source: ``services/compliance/src/index.js``

The service also hosts :ref:`architecture-external-exposure`, which assesses the same tenant from the outside without credentials. The two share the service's queue infrastructure, models, and PDF rendering, but are otherwise independent.

Control Sets
------------

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - ``assessment_type``
     - Coverage
   * - ``cis_v400``
     - CIS Microsoft 365 Benchmark v4.0.0
   * - ``maes_entra_v100``
     - MAES Entra ID posture: identity exposure that the CIS set does not reach

Control definitions live as rows in ``maes.compliance_controls``; the check logic is registered in code, keyed on ``control_id``. A control with no registered checker resolves to ``manual_review`` rather than being skipped, which is the extension seam for new checks.

Assessment Flow
---------------

.. mermaid::

   sequenceDiagram
     participant API
     participant Compliance
     participant Graph
     participant DB

     API->>Compliance: POST /api/assessment/start
     Compliance->>DB: Create assessment record
     Compliance->>Graph: Authenticate (MSAL + Certificate)
     Compliance->>Graph: Collect tenant data
     loop For each CIS control
       Compliance->>Graph: Query configuration
       Compliance->>DB: Store result
     end
     Compliance->>DB: Calculate scores
     Compliance->>DB: Generate failing entities
     API->>Compliance: POST /api/assessment/:id/report
     Compliance->>Compliance: Generate HTML/JSON/PDF report

CIS v4.0.0 Controls
-------------------

The engine evaluates controls defined in ``compliance_controls`` table. Currently implemented automated checks:

.. list-table::
   :header-rows: 1
   :widths: 15 40 20 25

   * - Control
     - Title
     - Method
     - Status
   * - 1.1.1
     - Ensure MFA is enabled for all global admins
     - Graph API
     - Automated
   * - 1.1.2
     - Ensure admin accounts are named
     - Manual
     - Manual Review
   * - 1.1.3
     - Ensure guest user restrictions
     - Manual
     - Manual Review
   * - 1.2.1
     - Ensure Conditional Access requires MFA
     - Graph API
     - Automated
   * - 1.2.2
     - Ensure legacy authentication is blocked
     - Manual
     - Manual Review
   * - 3.1.1
     - Ensure OAuth app review
     - Graph API
     - Automated
   * - 6.5.4
     - Ensure SMTP AUTH is disabled
     - Manual
     - Manual Review
   * - 7.2.11
     - Ensure SharePoint sharing links are restricted
     - Manual
     - Manual Review
   * - 8.2.2
     - Ensure Teams external access is restricted
     - Manual
     - Manual Review

MAES Entra ID Posture (``maes_entra_v100``)
-------------------------------------------

Identity-exposure controls covering ground the CIS set does not reach. Check logic lives in ``services/compliance/src/services/checkers/``.

.. list-table::
   :header-rows: 1
   :widths: 18 52 30

   * - Control
     - Title
     - Source
   * - MAES-FED-01
     - Federated domains are inventoried and understood
     - Graph ``/domains``
   * - MAES-FED-02
     - AD FS WS-Trust endpoints are not publicly reachable
     - HTTP probe
   * - MAES-FED-03
     - AD FS metadata exchange endpoint is not exposed
     - HTTP probe
   * - MAES-AUTH-01
     - Resource owner password credentials (ROPC) sign-in is blocked
     - Conditional Access
   * - MAES-AUTH-02
     - Legacy authentication is blocked tenant-wide
     - Conditional Access
   * - MAES-MFA-01
     - All enabled users have registered a strong authentication method
     - Registration report
   * - MAES-MFA-02
     - Privileged role holders have a phishing-resistant method
     - Registration report + roles
   * - MAES-MFA-03
     - No enabled user is excluded from every MFA-enforcing policy
     - Conditional Access
   * - MAES-CA-01
     - Policies are not parked in report-only or disabled state
     - Conditional Access
   * - MAES-CA-02
     - Break-glass and excluded principals are inventoried and constrained
     - Conditional Access
   * - MAES-SP-01
     - Service principals do not hold high-privilege application permissions
     - Graph ``/servicePrincipals``
   * - MAES-SP-02
     - Application credentials are current and not excessively long-lived
     - Graph ``/servicePrincipals``
   * - MAES-MAIL-01
     - SPF is published and not permissive
     - DNS
   * - MAES-MAIL-02
     - DMARC is published with an enforcing policy
     - DNS
   * - MAES-MAIL-03
     - DKIM signing is enabled per domain
     - DNS
   * - MAES-DNS-01
     - Supporting mail and DNS security records are published
     - DNS

Three of these probe the tenant's own AD FS host over HTTP, discovered through the unauthenticated user-realm endpoint. No credentials are submitted — reachability alone is the signal.

Assessment Results
------------------

Each control evaluation produces:

- **Status**: ``compliant``, ``non_compliant``, ``manual_review``, ``not_applicable``, ``error``
- **Score**: 0–100 per control
- **Evidence**: JSONB with actual configuration data
- **Failing entities**: Specific users, policies, or resources that fail the check
- **Remediation guidance**: Actionable steps with priority classification

Scores are weighted by control severity (Level 1 / Level 2) and rolled up to an overall compliance score.

Entity-Level Detail
-------------------

The compliance engine tracks failing entities at a granular level:

- **Failing users** — UPN, last sign-in, MFA status, role assignments
- **Policy gaps** — Missing or incomplete conditional access policies
- **Application risks** — OAuth apps with high-risk permissions

This enables targeted remediation rather than just a pass/fail score.

Report Generation
-----------------

The ``ReportGenerator`` (``services/compliance/src/services/reportGenerator.js``) produces:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Format
     - Type
     - Description
   * - HTML
     - full
     - Complete multi-section report with tenant overview, failing entities, remediation
   * - HTML
     - executive
     - High-level summary with scores and trends
   * - HTML
     - remediation
     - Actionable remediation steps prioritized by severity
   * - HTML
     - comparison
     - Side-by-side comparison between assessments
   * - JSON
     - any
     - Structured data export
   * - CSV
     - any
     - Tabular data export
   * - PDF
     - any
     - Printable PDF report
   * - XLSX
     - any
     - Excel spreadsheet

Scheduled Assessments
---------------------

The ``Scheduler`` (``services/compliance/src/services/scheduler.js``) supports:

- **Frequency**: daily, weekly, monthly, quarterly
- **Automatic next-run calculation**
- **Baseline flagging** for initial assessment comparison

API Endpoints
-------------

The compliance service exposes internal API on port 3002:

- ``POST /api/assessment/start`` — Start a new assessment
- ``GET /api/assessment/:id`` — Get assessment status and results
- ``POST /api/assessment/:id/report`` — Generate a report
- ``GET /api/assessment/:id/reports`` — List reports
- ``GET /api/assessment/:id/report/:fileName/download`` — Download report file
- ``POST /api/schedule`` — Create scheduled assessment
- ``GET /api/schedules/:orgId`` — List schedules
- ``PUT /api/schedule/:id`` — Update schedule
- ``DELETE /api/schedule/:id`` — Delete schedule
- ``GET /api/scheduler/stats`` — Scheduler statistics

All endpoints require ``x-service-token`` authentication.
