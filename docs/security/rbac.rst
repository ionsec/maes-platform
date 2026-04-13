.. _security-rbac:

Role-Based Access Control
=========================

MAES uses a role-permission model with three built-in roles and fine-grained permission overrides.

Roles
-----

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Role
     - Description
   * - ``super_admin``
     - Full system access. Can manage all organizations, users, system settings, API keys, licenses, backups, and developer tools. Can impersonate users and delete organizations.
   * - ``admin``
     - Full access within their organization. Can manage users, extractions, analysis, alerts, compliance, integrations, and audit logs. Cannot access global settings or other organizations.
   * - ``analyst``
     - Can run extractions and analysis, view reports, manage alerts, and export data within their organization.
   * - ``viewer``
     - Read-only access. Can view dashboard, extractions, analysis results, and reports. Cannot create or modify resources.

Permission Matrix
-----------------

.. list-table::
   :header-rows: 1
   :widths: 30 10 10 10 10

   * - Permission
     - super_admin
     - admin
     - analyst
     - viewer
   * - canManageExtractions
     - ✓
     - ✓
     - ✓
     - ✗
   * - canRunAnalysis
     - ✓
     - ✓
     - ✓
     - ✗
   * - canViewReports
     - ✓
     - ✓
     - ✓
     - ✓
   * - canManageAlerts
     - ✓
     - ✓
     - ✓
     - ✗
   * - canManageUsers
     - ✓
     - ✓
     - ✗
     - ✗
   * - canManageOrganization
     - ✓
     - ✓
     - ✗
     - ✗
   * - canManageCompliance
     - ✓
     - ✓
     - ✗
     - ✗
   * - canManageSystemSettings
     - ✓
     - ✗
     - ✗
     - ✗
   * - canViewAuditLogs
     - ✓
     - ✓
     - ✗
     - ✗
   * - canExportData
     - ✓
     - ✓
     - ✓
     - ✗
   * - canCreateOrganizations
     - ✓
     - ✗
     - ✗
     - ✗
   * - canDeleteOrganizations
     - ✓
     - ✗
     - ✗
     - ✗
   * - canAccessAllClients
     - ✓
     - ✗
     - ✗
     - ✗
   * - canImpersonateUsers
     - ✓
     - ✗
     - ✗
     - ✗

Permission Enforcement
----------------------

Permissions are enforced at two levels:

1. **Role-based fallback** — If a user has no custom permissions, the role's default permission set is used.
2. **Custom override** — Per-user permission JSONB can override role defaults.

The ``requirePermission()`` middleware checks both sources.

Multi-Organization Access
-------------------------

Users can belong to multiple organizations via the ``user_organizations`` table. When accessing a different organization:

- Super admins can access any organization
- Other users must have an explicit ``user_organizations`` record
- Organization context is set via ``?organizationId=`` query param or ``X-Organization-Id`` header

Audit Trail
-----------

All security-relevant actions are logged to the ``audit_logs`` table:

- Login success/failure
- Account lockout
- Alert management
- User management
- Organization changes
- Certificate operations
