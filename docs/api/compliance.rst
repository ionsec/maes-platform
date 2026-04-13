.. _api-compliance:

Compliance
==========

Manage CIS compliance assessments, controls, and reports. All endpoints require JWT authentication.

Check Credentials Status
------------------------

.. http:get:: /api/compliance/organization/(organizationId)/credentials-status

   Check if an organization has Microsoft 365 credentials configured for compliance assessments.

Get Compliance Controls
-----------------------

.. http:get:: /api/compliance/controls/(assessment_type)

   List CIS benchmark controls for a given assessment type (default: ``cis_v400``).

   :query section: Filter by section
   :query severity: Filter by severity (``level1``, ``level2``)
   :query active: Filter by active status (``true``, ``false``)

List Assessments
----------------

.. http:get:: /api/compliance/assessments

   List compliance assessments for the current organization.

   :query page: Page number
   :query limit: Items per page
   :query assessment_type: Filter by type
   :query status: Filter by status

Get Assessment
--------------

.. http:get:: /api/compliance/assessments/(id)

   Get a single assessment with its control results and failing entities.

Start Assessment
----------------

.. http:post:: /api/compliance/assessments

   Start a new compliance assessment. Requires ``canManageCompliance`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "organizationId": "uuid",
        "assessmentType": "cis_v400",
        "options": {
          "name": "Quarterly CIS Review",
          "isBaseline": false
        }
      }

Get Assessment Summary
----------------------

.. http:get:: /api/compliance/assessments/(id)/summary

   Get a summary with scores, failing entity breakdown, and prioritized recommendations.

Generate Report
---------------

.. http:post:: /api/compliance/assessments/(id)/report

   Generate a compliance report. Requires ``canManageCompliance`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "format": "html",
        "type": "full",
        "options": {}
      }

   Supported formats: ``html``, ``json``, ``csv``, ``pdf``, ``xlsx``
   Supported types: ``full``, ``executive``, ``remediation``, ``comparison``

List Reports
------------

.. http:get:: /api/compliance/assessments/(id)/reports

   List all generated reports for an assessment.

Download Report
---------------

.. http:get:: /api/compliance/assessments/(id)/report/(fileName)/download

   Download a generated report file.

Schedule Assessment
-------------------

.. http:post:: /api/compliance/schedules

   Create a scheduled compliance assessment.

   **Request Body:**

   .. code-block:: json

      {
        "organizationId": "uuid",
        "name": "Monthly CIS Check",
        "assessmentType": "cis_v400",
        "frequency": "monthly"
      }

   Supported frequencies: ``daily``, ``weekly``, ``monthly``, ``quarterly``
