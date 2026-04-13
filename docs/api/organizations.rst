.. _api-organizations:

Organizations
=============

Manage organizations, credentials, onboarding, and offboarding. All endpoints require JWT authentication.

Get Current Organization
------------------------

.. http:get:: /api/organizations/current

   :query showCredentials: Set to ``true`` to return actual credentials (otherwise masked).

Update Organization
-------------------

.. http:put:: /api/organizations/current

   Update organization settings. Requires ``canManageOrganization`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "name": "Updated Org Name",
        "tenantId": "uuid",
        "fqdn": "org.example.com",
        "settings": {}
      }

Update Credentials
------------------

.. http:put:: /api/organizations/current/credentials

   Update Microsoft 365 credentials. Requires ``canManageOrganization`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "clientId": "azure-ad-app-id",
        "tenantId": "m365-tenant-id",
        "certificateThumbprint": "thumbprint"
      }

Offboard Organization
---------------------

.. http:post:: /api/organizations/(id)/offboard

   Schedule an organization for offboarding with a grace period. Requires ``super_admin`` role.

   **Request Body:**

   .. code-block:: json

      {
        "gracePeriodDays": 30,
        "reason": "Contract ended"
      }

   Data is permanently deleted after the grace period.

Restore Organization
--------------------

.. http:post:: /api/organizations/(id)/restore

   Cancel a scheduled offboarding. Requires ``super_admin`` role.

Delete Organization
-------------------

.. http:delete:: /api/organizations/(id)

   Immediately delete an organization and all associated data. Requires ``super_admin`` role.

   :query force: Set to ``true`` to override active extraction check.

Configuration Status
--------------------

.. http:get:: /api/organizations/configuration-status

   Check if the current organization has all required configurations set up (credentials, certificates, tenant ID).
