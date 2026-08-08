.. _architecture-external-exposure:

External Exposure Scanning
==========================

Every other MAES capability looks at a tenant from the inside, holding
credentials. External exposure scanning looks at it from the outside, holding
nothing — the view an attacker has before they have anything.

It runs inside the compliance service but is otherwise independent: seeded by a
domain rather than by credentials, with its own queue, schema, engine, and
report family.

Source: ``services/compliance/src/recon/``

.. important::

   Scans send real traffic to infrastructure outside MAES, including third
   parties at the aggressive tier. Read :ref:`security-authorized-scanning`
   before operating this.

Scan flow
---------

.. mermaid::

   sequenceDiagram
     participant API
     participant Service as Compliance Service
     participant Queue as BullMQ (maes-recon)
     participant Engine as ReconEngine
     participant DB

     API->>Service: POST /api/recon/start
     Service->>Queue: enqueue (attempts: 1)
     Queue->>Engine: runScan(org, domain, profile)
     Engine->>DB: authorizeScan — refuse before creating anything
     Engine->>DB: Create scan record
     loop For each phase at this profile
       Engine->>Engine: probe / resolve via shared clients
       Engine->>DB: Append to recon_probe_log
       Engine->>DB: Update progress
     end
     Engine->>DB: Store findings
     Engine->>Engine: Assemble attack paths from finding tags
     Engine->>DB: Store attack paths
     Engine->>DB: Raise alerts for drift vs previous scan

Scans are enqueued with ``attempts: 1``. A recon job sends real outbound
traffic, so an automatic retry would silently double it; failures surface to the
operator instead.

The worker runs at concurrency 1. Scans are already parallel internally through
the probe client, and running several at once would multiply outbound traffic
beyond what the per-scan rate limits were sized for.

Phases
------

A phase receives a context object carrying the probe client, the resolver, the
seed domain, and shared state written by earlier phases. It emits findings and
returns. Phases run in order, because later ones consume the hostnames and
tenant details earlier ones discover.

.. list-table::
   :header-rows: 1
   :widths: 22 15 63

   * - Phase
     - Profile
     - What it establishes
   * - ``tenant``
     - passive
     - Tenant id, cloud, region, and whether the domain is federated or managed
   * - ``dns_surface``
     - passive
     - SPF, DMARC, DKIM selectors, CAA, MTA-STS, TLS-RPT, MX
   * - ``cert_transparency``
     - passive
     - Hostnames from CT logs — the main source of scope for later phases
   * - ``subdomain_takeover``
     - passive
     - CNAMEs pointing at claimable cloud resources that no longer resolve
   * - ``leads``
     - passive
     - Analyst queries for the credential-gated intelligence sources
   * - ``federation_probe``
     - standard
     - AD FS MEX and WS-Trust endpoint reachability
   * - ``http_headers``
     - standard
     - HSTS, CSP, X-Frame-Options; leaked subscription identifiers
   * - ``azure_surface``
     - standard
     - Anonymously listable storage containers, reachable Kudu sites
   * - ``m365_surface``
     - standard
     - Anonymous SharePoint REST access, anonymous Dataverse OData feeds
   * - ``user_enumeration``
     - aggressive
     - Whether account existence is disclosed to unauthenticated callers
   * - ``cross_saas``
     - aggressive
     - Third-party SaaS tenants belonging to the organization

Adding a phase means subclassing ``BasePhase``
(``src/recon/phases/basePhase.js``) and registering it in
``src/recon/phases/index.js`` with a ``profile``. A phase cannot reach the
network except through ``this.probe`` and ``this.dns``, which is what makes the
rate limiting, probe budget, and audit trail unavoidable rather than a
convention.

Evidence quality
~~~~~~~~~~~~~~~~

Two phases establish results by differential rather than by a single response,
because the naive signal is wrong:

* ``user_enumeration`` compares a random, certainly-invalid address against an
  optional operator-supplied one. No password is ever submitted and no account
  list is harvested — the check establishes only whether existence is
  disclosed.
* ``cross_saas`` probes a random control slug alongside the real one on each
  platform. Several platforms serve a soft 404 (HTTP 200 with a "not found"
  page) or redirect every request to sign-in, so a bare status code proves
  nothing. Platforms that answer identically for both are reported as
  inconclusive rather than as a finding.

The findings catalog
--------------------

Phases decide *whether* something is present. ``src/recon/findings/catalog.js``
decides what it means: severity, impact, remediation, tags, and MITRE ATT&CK
mapping.

Keeping the risk judgements in one file rather than inline in detection code
makes them reviewable as a set — the same separation the compliance side gets
from storing control definitions in the database. Emitting a finding id that is
not in the catalog throws rather than inventing a finding.

Attack paths
------------

Individual findings are often unremarkable alone; the combination is what
matters. Every catalog entry carries tags, and ``src/recon/attackPaths.js``
matches templates against the tags present in a scan.

A template fires only when *all* of its trigger tags appear. Narratives are
generated from the findings that matched, so they name real hosts rather than
describing the pattern abstractly.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Path
     - Fires when
   * - Golden SAML via on-premises AD FS
     - The domain is federated **and** the MEX endpoint is publicly readable
   * - Password spraying through an MFA-exempt path
     - Any finding tagged as an MFA bypass path; the narrative adapts if
       account enumeration is also possible
   * - Unauthenticated data exfiltration
     - A data store returns content to unauthenticated requests
   * - Subdomain takeover into credential phishing
     - A dangling record points at an unclaimed resource
   * - Inbound phishing as the organization itself
     - Mail authentication is incomplete
   * - Unauthenticated code execution surface
     - A serverless endpoint responds without a key

Data model
----------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Table
     - Contents
   * - ``maes.recon_scans``
     - One scan: seed domain, profile, status, progress, per-severity counters,
       the authorization that permitted it, and metadata recording coverage
   * - ``maes.recon_findings``
     - Findings and leads, with evidence, tags, and ATT&CK mapping
   * - ``maes.recon_attack_paths``
     - Chains assembled from finding tags
   * - ``maes.recon_authorizations``
     - Recorded scope attestations
   * - ``maes.recon_probe_log``
     - Every outbound HTTP probe and DNS lookup
   * - ``maes.recon_reports``
     - Generated report metadata

Scheduling reuses ``maes.compliance_schedules`` via a ``schedule_kind``
discriminator, so both assessment families share one schedule lifecycle.

Drift comparison
----------------

``src/recon/comparison.js`` diffs two scans. Findings are matched on
``(finding_id, target)`` rather than on the finding id alone: a dangling record
on ``old.contoso.com`` and one on ``legacy.contoso.com`` are two separate
exposures, not one recurring issue.

A severity change is reported separately from persistence, with its direction,
so a finding that quietly escalated is not filed alongside the ones that simply
stayed put. Leads are excluded — they reappear on every scan by design and
would bury the exposures that actually changed.

The comparison also raises warnings rather than silently producing misleading
output: mismatched profiles, mismatched seed domains, a failed certificate
transparency lookup, or an exhausted probe budget in either scan each surface
alongside the results.

Alerting
--------

The constraint is noise. A weekly scan of a tenant with twelve standing
findings must not produce twelve alerts every week; that trains people to
ignore the channel, which is worse than not alerting at all. There is no
deduplication elsewhere in the platform's alert path, so recon handles it by
alerting on change:

* findings absent from the previous scan of the same domain **at the same
  profile**
* only at ``high`` or ``critical``, plus any finding that escalated into them
* plus any newly-assembled attack path, graded at least ``high`` — a route an
  attacker can walk end to end is a step change even when its constituent
  findings were individually known

A domain's first scan has no predecessor, so it raises one summary alert rather
than a wall of them during onboarding, and none at all if nothing severe was
found.

Alerts carry ATT&CK ids under ``mitre_attack.techniques``, the shape the SIEM
export path reads, so they forward to a configured SIEM with no extra wiring.
Alerting runs after results are committed, and its failure is caught: a scan
whose findings are already stored is not failed by a reporting step.

Reports
-------

HTML, PDF, JSON, and CSV, via ``src/recon/reconReportGenerator.js``. PDF
rendering is shared with the compliance reports
(``src/services/pdfRenderer.js``) so both print identically.

Every report carries a **coverage and limitations** section built from scan
metadata — a failed CT lookup, an exhausted probe budget, truncated host lists,
failed phases, and what the chosen profile did not look for. An empty result
reads as "review the coverage notes", never as an unqualified clean bill of
health.

The probe audit trail can be embedded on request. It is useful for internal
review or for answering a third party asking what MAES sent them, and is
usually left out of a customer-facing deliverable.

Configuration
-------------

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Setting
     - Default
   * - Probe budget (passive / standard / aggressive)
     - 400 / 1500 / 4000
   * - Concurrency cap
     - 8 simultaneous requests
   * - Per-host minimum interval
     - 750 ms plus up to 250 ms jitter
   * - Request timeout
     - 8 s (30 s for the CT log query)
   * - CT hostnames carried forward
     - 300
   * - Hosts checked for response headers
     - 50

Limits that truncate coverage are recorded in scan metadata and reported, never
applied silently.
