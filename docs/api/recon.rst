.. _api-recon:

External Exposure
=================

Domain-seeded attack surface scanning. All endpoints require JWT
authentication. Read endpoints require ``canManageCompliance``; starting a scan
and managing scope authorizations require an administrator role.

.. important::

   These endpoints cause outbound traffic to systems outside MAES. See
   :ref:`security-authorized-scanning`.

Scans
-----

Start a Scan
~~~~~~~~~~~~

.. http:post:: /api/recon/scan/(organizationId)

   Queue an external exposure scan. Requires an administrator role.

   :<json string seedDomain: **Required.** Domain to scan from. Scheme, port,
      and path are stripped.
   :<json string profile: ``passive`` (default), ``standard``, or
      ``aggressive``.
   :<json string name: Optional scan name.
   :<json string description: Optional description.
   :<json string seedUser: Optional known-valid account, used by the
      account-enumeration check at the aggressive profile. No password is ever
      submitted.

   :status 200: Scan queued.
   :status 400: Validation failed.
   :status 403: Refused by the authorization gate. The message states why —
      relay it to the operator rather than replacing it with a generic error.

List Scans
~~~~~~~~~~

.. http:get:: /api/recon/scans/(organizationId)

   :query limit: Page size (default 25, max 100).
   :query offset: Offset.

Get a Scan
~~~~~~~~~~

.. http:get:: /api/recon/scan/(scanId)

   Returns the scan with its findings and attack paths.

   :query includeFindings: ``true`` (default) or ``false``.
   :query includeProbeLog: ``false`` (default). ``true`` embeds the probe audit
      trail, capped at 5000 entries.

Get the Probe Log
~~~~~~~~~~~~~~~~~

.. http:get:: /api/recon/scan/(scanId)/probe-log

   Every outbound HTTP probe and DNS lookup the scan made, with method, URL,
   host, status code, elapsed time, and User-Agent.

Compare Scans
~~~~~~~~~~~~~

.. http:get:: /api/recon/compare/(baselineId)/(currentId)

   Drift between two completed scans of the same organization.

   Returns ``findings`` split into ``added``, ``resolved``, ``persisting``, and
   ``severityChanged`` (each carrying ``previousSeverity`` and a ``direction``),
   the same split for ``attackPaths``, and a ``comparability`` array of
   warnings where the two scans are not like for like.

   :status 400: The scans are not both completed, or belong to different
      organizations.

Reports
-------

Generate a Report
~~~~~~~~~~~~~~~~~

.. http:post:: /api/recon/scan/(scanId)/report

   :<json string format: ``html`` (default), ``pdf``, ``json``, or ``csv``.
   :<json boolean includeEvidence: Default ``true``.
   :<json boolean includeProbeLog: Default ``false``.

   :status 400: The scan is not completed.

   If PDF rendering is unavailable, an HTML report is produced instead and the
   response carries a ``note`` saying so.

List Reports
~~~~~~~~~~~~

.. http:get:: /api/recon/scan/(scanId)/reports

Download a Report
~~~~~~~~~~~~~~~~~

.. http:get:: /api/recon/scan/(scanId)/report/(fileName)/download

Schedules
---------

Recon schedules share the compliance schedule lifecycle. Authorization is
re-checked each time a schedule fires; when it has lapsed the schedule
deactivates itself and records the reason.

Create a Schedule
~~~~~~~~~~~~~~~~~

.. http:post:: /api/recon/schedules/(organizationId)

   Requires an administrator role.

   :<json string name: **Required.**
   :<json string frequency: ``daily``, ``weekly``, ``monthly``, or
      ``quarterly``.
   :<json string seedDomain: **Required.**
   :<json string profile: **Required.**
   :<json string seedUser: Optional.

   :status 403: Refused by the authorization gate at creation time, so a
      schedule that could never run is not created.

List Schedules
~~~~~~~~~~~~~~

.. http:get:: /api/recon/schedules/(organizationId)

Delete a Schedule
~~~~~~~~~~~~~~~~~

.. http:delete:: /api/recon/schedules/(organizationId)/(scheduleId)

Scope Authorizations
--------------------

Record an Authorization
~~~~~~~~~~~~~~~~~~~~~~~

.. http:post:: /api/recon/authorizations/(organizationId)

   Requires an administrator role. Attribution is taken from the authenticated
   session, not from the request body.

   :<json array domains: **Required**, non-empty. Subdomains of each entry are
      covered.
   :<json string profileCeiling: ``passive``, ``standard`` (default), or
      ``aggressive``.
   :<json string expiresAt: **Required.** ISO 8601, must be in the future.
   :<json string authorizationReference: Engagement or ticket reference.
   :<json string notes: Free text.

List Authorizations
~~~~~~~~~~~~~~~~~~~

.. http:get:: /api/recon/authorizations/(organizationId)

Revoke an Authorization
~~~~~~~~~~~~~~~~~~~~~~~

.. http:delete:: /api/recon/authorizations/(organizationId)/(authorizationId)

   Requires an administrator role. Takes effect immediately.

   :status 404: Not found, or already revoked.
