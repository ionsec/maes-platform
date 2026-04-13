.. _api-users:

Users
=====

User management endpoints. All endpoints require JWT authentication.

List Users
----------

.. http:get:: /api/users

   Requires ``canManageUsers`` permission.

   :query page: Page number (default 1)
   :query limit: Items per page (default 20)
   :query role: Filter by role
   :query search: Search by name, email, or username
   :query isActive: Filter by active status (``true``, ``false``)
   :query allOrganizations: Super admins can view all users across orgs

Get User
--------

.. http:get:: /api/users/(userId)

   Requires ``canManageUsers`` permission.

Create User
-----------

.. http:post:: /api/users

   Create a new user. Requires ``canManageUsers`` permission.

   **Request Body:**

   .. code-block:: json

      {
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "securepassword",
        "firstName": "New",
        "lastName": "User",
        "role": "analyst",
        "specialization": ["forensics", "compliance"],
        "accessibleOrganizations": []
      }

   Super admins can create users in any organization via ``organizationId``.

Update User
-----------

.. http:put:: /api/users/(userId)

   Update user details, role, permissions, and active status.

Deactivate / Reactivate User
----------------------------

.. http:put:: /api/users/(userId)/deactivate

.. http:put:: /api/users/(userId)/reactivate

Get All Organizations
---------------------

.. http:get:: /api/users/organizations/all

   Super admin only. List all organizations for user management.

Registration
------------

.. http:post:: /api/registration/user

   Public endpoint — no authentication required. Register a new individual user with ``viewer`` role.

   **Request Body:**

   .. code-block:: json

      {
        "email": "user@example.com",
        "username": "newuser",
        "password": "securepassword",
        "firstName": "First",
        "lastName": "Last",
        "tenantId": "optional-m365-tenant-id",
        "consentToken": "optional-consent-token"
      }

Get Tenant App Info
-------------------

.. http:get:: /api/registration/tenant-app-info

   Public endpoint. Returns the MAES Azure AD application ID and admin consent URL for Microsoft 365 integration.
