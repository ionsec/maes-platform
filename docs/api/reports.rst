.. _api-reports:

Reports
=======

Generate and manage reports. All endpoints require JWT authentication.

List Reports
------------

.. http:get:: /api/reports

   :query page: Page number (default 1)
   :query limit: Items per page (default 20, max 100)
   :query type: Filter by type — ``executive_summary``, ``incident_report``, ``compliance_report``, ``threat_analysis``, ``user_activity``, ``system_health``, ``custom``
   :query status: Filter by status — ``pending``, ``generating``, ``completed``, ``failed``

Get Report
----------

.. http:post:: /api/reports/(id)

   Get a single report with creator information.

Create Report
-------------

.. http:post:: /api/reports

   Create a new report. Requires ``canViewReports`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "name": "Weekly Security Report",
        "type": "executive_summary",
        "format": "pdf",
        "parameters": {},
        "schedule": {}
      }

Download Report
---------------

.. http:get:: /api/reports/(id)/download

   Download a completed report file.

Delete Report
-------------

.. http:delete:: /api/reports/(id)

   Delete a report. Only the creator or an admin can delete. Requires ``canViewReports`` permission.
