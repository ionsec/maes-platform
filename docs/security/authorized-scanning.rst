.. _security-authorized-scanning:

Authorized Scanning
===================

External exposure scans send real network traffic to infrastructure outside
MAES. Unlike every other capability in the platform — which reads a tenant you
already hold credentials for — a scan reaches out and touches systems, some of
which belong to third parties.

This page describes the controls that govern that, and what an operator is
responsible for. **Read it before running an aggressive scan.**

.. warning::

   Scanning infrastructure you are not authorized to scan may be unlawful in
   your jurisdiction regardless of intent. MAES enforces a scope gate, but the
   gate records *your* attestation — it cannot verify that the authorization
   you assert actually exists. The responsibility remains yours.

Scan profiles
-------------

Each tier is a strict superset of the one before it.

.. list-table::
   :header-rows: 1
   :widths: 15 30 55

   * - Profile
     - Reaches
     - What it does
   * - ``passive``
     - Public records and Microsoft's own discovery endpoints
     - Public DNS, certificate transparency logs, tenant fingerprinting via the
       OpenID configuration and user-realm endpoints, and dangling-DNS
       detection. Nothing is sent to hosts the assessed organization operates.
   * - ``standard``
     - The organization's own surface
     - Adds bounded, read-only requests to hosts the organization
       demonstrably owns: AD FS endpoints, discovered web hosts, their Azure
       storage and App Service names, and their SharePoint and Power Pages
       surface. No credentials are ever submitted.
   * - ``aggressive``
     - Third-party platforms, and enumeration
     - Adds account-existence testing against Microsoft sign-in endpoints and
       tenant-existence probes against third-party SaaS platforms.

.. note::

   ``passive`` is deliberately the default. A scan you did not intend to be
   loud should not become loud because a field defaulted the wrong way.

The authorization gate
----------------------

Enforced in ``services/compliance/src/recon/authorization.js``, in one place,
before a scan record is even created. A refused scan leaves nothing behind.

.. list-table::
   :header-rows: 1
   :widths: 20 40 40

   * - Profile
     - Against an organization-registered domain
     - Against any other domain
   * - ``passive``
     - Permitted
     - Requires a scope authorization
   * - ``standard``
     - Permitted
     - Requires a scope authorization
   * - ``aggressive``
     - **Requires a scope authorization**
     - **Requires a scope authorization**

Owning the domain is sufficient for the first two tiers and is *never*
sufficient for ``aggressive``. That tier enumerates accounts and probes
platforms belonging to other organizations, so it is not run on an implicit
basis.

Scope authorizations
--------------------

A scope authorization is a recorded attestation, stored in
``maes.recon_authorizations``:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Meaning
   * - ``domains``
     - Domains covered. Subdomains of each entry are covered; a leading
       ``*.`` is treated as its parent. ``contoso.com`` covers
       ``mail.contoso.com`` but never ``evilcontoso.com``.
   * - ``profile_ceiling``
     - The most aggressive profile this authorization permits.
   * - ``authorized_by`` / ``authorized_by_name``
     - The MAES user who recorded it. Set from the authenticated session, not
       from the request body.
   * - ``authorization_reference``
     - Your engagement, ticket, or contract reference.
   * - ``expires_at``
     - Required. There is no non-expiring authorization.
   * - ``revoked_at``
     - Set when revoked; a revoked authorization stops permitting immediately.

Recording one requires an administrator role and an explicit confirmation in
the UI. Authorizations are retained alongside the scans they authorized, and
each scan stores the ``authorization_id`` that permitted it.

Expiry and revocation
~~~~~~~~~~~~~~~~~~~~~

Authorization is re-checked **every time a scan runs**, not only when it is
requested. This matters most for scheduled scans: a weekly aggressive scan set
up under a 30-day authorization stops on day 31. Rather than failing silently
or retrying nightly against a scope you no longer hold, the schedule
deactivates itself and records why, which is surfaced in the UI.

The probe audit trail
---------------------

Every outbound request — HTTP probe and DNS lookup alike — is written to
``maes.recon_probe_log`` with its method, URL, host, status code, elapsed time,
and the User-Agent used. This is not optional and not limited to the aggressive
tier.

A tool that touches other people's infrastructure must be able to account for
exactly what it sent. If a third party asks, the probe log is the answer. It is
downloadable through the API and can be embedded in a report, though it is
usually left out of a customer-facing deliverable.

Rate limiting and traffic shaping
---------------------------------

All outbound traffic goes through a single client
(``services/compliance/src/recon/probeClient.js``). Scan phases never construct
HTTP requests themselves, so none of the following can be bypassed by a phase:

* a global concurrency cap
* a per-host minimum interval with jitter, so requests to one host are paced
  and do not arrive as a metronome
* a per-scan probe budget — 400 for ``passive``, 1500 for ``standard``, 4000
  for ``aggressive``. Reaching it stops the scan early and is recorded in the
  scan metadata and every report, rather than silently truncating coverage
* a per-request timeout, no redirect following, and no credentials or cookies
  sent to a probed host

User-Agent
~~~~~~~~~~

Scans identify themselves honestly by default::

   MAES-ExternalExposure/1.0 (+security-assessment; contact your MAES administrator)

MAES does not impersonate a browser or a Microsoft client in order to blend in.
Detection evasion is not a supported feature.

What MAES will not do without a credential
------------------------------------------

Code-search, breach-intelligence, and web-search dorking each require a
third-party API key. Where none is configured for the organization, MAES emits
the queries as *analyst leads* rather than executing them. It will not spend
someone else's API quota, and will not send a customer's domain to a third
party, as a side effect of a scan.

Leads are marked as such throughout, are excluded from severity counts, and
never raise alerts.

Interpreting results honestly
-----------------------------

Two properties of the output are worth understanding before you act on it:

**Absence of a finding is not absence of the issue.** A ``passive`` scan does
not perform the checks that a ``standard`` scan does. Every report states which
phases ran and what the profile did not look for.

**Coverage can be narrower than it appears.** If the certificate transparency
lookup fails, every host-based phase examines only the seed domain — a scan
that superficially looks clean. Failed lookups, exhausted probe budgets,
truncated host lists, and failed phases are all recorded and printed in the
coverage section of every report, and shown in the scan detail view.

Scan comparison applies the same principle: comparing a ``passive`` scan
against an ``aggressive`` one raises an explicit warning, because findings
unique to the more aggressive scan reflect checks the other never ran, not
change in the environment.

Alerting
--------

Completed scans raise alerts for *change*, not for state — only exposures
absent from the previous scan of the same domain at the same profile, at high
or critical severity, plus escalations and newly-assembled attack paths.

A first scan of a domain raises one summary alert rather than one per finding.
See :ref:`architecture-external-exposure` for the detail.

Operator checklist
------------------

Before an ``aggressive`` scan:

#. Confirm you hold written authorization covering the target domains, and that
   it is current.
#. Record a scope authorization with the engagement reference and an expiry no
   later than the authorization it represents.
#. Prefer ``standard`` first. Most exposures worth acting on are visible
   without enumeration.
#. After the scan, review ``recon_probe_log`` to confirm what was sent.
#. Revoke the authorization when the engagement ends. Do not leave a standing
   aggressive ceiling in place.
