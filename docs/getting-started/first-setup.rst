.. _first-setup:

First-Time Setup
================

After installing the platform, complete these steps before running extractions or assessments.

1. Register the First User
---------------------------

Navigate to ``https://localhost/register`` and create your account. The first registered user gets the ``viewer`` role.

To promote to admin:

.. code-block:: sql

   -- Connect to the database
   docker compose exec postgres psql -U maes_user -d maes_db

   -- Promote user to admin
   UPDATE maes.users SET role = 'admin', permissions = '{"canManageExtractions":true,"canRunAnalysis":true,"canViewReports":true,"canManageAlerts":true,"canManageUsers":true,"canManageOrganization":true,"canManageCompliance":true}'::jsonb
   WHERE email = 'your-email@example.com';

2. Complete Organization Onboarding
-------------------------------------

After login, the platform guides you through onboarding:

1. **Create an organization** — Set the organization name and tenant ID.
2. **Configure Microsoft 365 credentials** — Provide:

   - **Client ID** (Azure AD Application ID)
   - **Tenant ID** (Microsoft 365 tenant GUID)
   - **Certificate** — Upload a PFX certificate or use the extractor-managed default certificate

3. **Grant admin consent** — Use the MAES admin consent URL to grant the required Microsoft Graph permissions to the MAES application.

3. Configure Microsoft 365 Application
----------------------------------------

The MAES Azure AD application (ID: ``574cfe92-60a1-4271-9c80-8aba00070e67``) requires the following Microsoft Graph permissions:

- ``AuditLog.Read.All``
- ``Directory.Read.All``
- ``Policy.Read.All``
- ``User.Read.All``
- ``IdentityRiskEvent.Read.All``
- ``SecurityEvents.Read.All``
- ``Device.Read.All``
- ``Organization.Read.All``

Grant these via the Microsoft Entra admin center or through the MAES consent flow.

4. Upload or Generate a Certificate
-------------------------------------

Two options:

**Option A — Use the default certificate:**

The extractor ships with a default certificate protected by ``CERT_PASSWORD``. This is suitable for evaluation but rotate for production.

**Option B — Upload your own certificate:**

Upload a PFX certificate through the UI (Settings → Certificates) or API. The platform stores the certificate encrypted at rest.

5. Test the Connection
----------------------

Before scheduling extractions, run a connection test from the Settings page to verify that:

- The certificate is valid and correctly linked to the Azure AD app
- Microsoft Graph API accepts authentication
- Required permissions are granted

6. Schedule Your First Extraction
---------------------------------

From the Extractions page:

1. Select an extraction type (e.g., **Unified Audit Log**)
2. Set the date range
3. Choose priority level
4. Submit the extraction job

The extractor service picks up the job from the Redis queue, authenticates to Microsoft 365, runs the PowerShell cmdlet, and stores the results. On completion, analysis is automatically triggered.

7. Review Analysis Results
---------------------------

After extraction completes, the analyzer automatically processes the data and generates findings. Review results on the Analysis page, where you can:

- View findings and severity classifications
- Acknowledge, assign, or resolve alerts
- Download raw extraction data as ZIP archives
