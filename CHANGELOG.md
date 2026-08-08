## [1.5.0] - 2026-08-08

### Added
- **MAES Entra ID Posture control set (`maes_entra_v100`)** — 16 authenticated controls covering identity exposure the CIS set does not reach: federation and AD FS surface, ROPC and legacy authentication, MFA registration coverage including phishing-resistant methods for privileged roles, Conditional Access exclusion gaps, service principal privilege and credential hygiene, and mail authentication (SPF/DMARC/DKIM/CAA/MTA-STS). Definitions are seeded as rows in `maes.compliance_controls`; check logic lives in `services/compliance/src/services/checkers/`. The engine now registers 25 automated checkers, up from 9.
- **External exposure scanning (`external_exposure`)** — an unauthenticated, domain-seeded attack surface assessment across 11 phases in three profiles. `passive` reads public records only; `standard` adds bounded read-only probing of hosts the organization demonstrably owns; `aggressive` adds account-existence testing and third-party SaaS probing.
  - A scope authorization model (`maes.recon_authorizations`) with per-domain coverage, a profile ceiling, and mandatory expiry. Aggressive scans are refused without one, and owning the domain is never sufficient for that tier.
  - A complete probe audit trail (`maes.recon_probe_log`) recording every outbound HTTP request and DNS lookup.
  - Centralised traffic shaping: concurrency cap, per-host rate limiting with jitter, a per-scan probe budget, and an honest User-Agent. Scan phases cannot reach the network except through the shared client, so none of it can be bypassed.
  - A findings catalog holding severity, impact, remediation, and MITRE ATT&CK mapping in one reviewable place, and tag-matched attack path assembly.
  - Scan-over-scan drift comparison, matching findings on `(finding_id, target)` and warning when two scans are not like for like.
  - Reports in HTML, PDF, JSON, and CSV, each carrying a coverage section naming what narrowed the scan.
  - Scheduling, sharing the compliance schedule lifecycle. Authorization is re-checked at fire time; a schedule whose authorization has lapsed deactivates itself and records why.
  - Alerts for newly-appeared high and critical exposures and newly-assembled attack paths, deduplicated against the previous scan so standing findings do not re-alert on every run.
- Per-user alert read state (`maes.alert_reads`), with `PATCH /api/alerts/:id` and `PATCH /api/alerts/mark-all-read`.
- Real-time `alert.created` websocket event, emitted from all three alert-creation paths.
- Jest test suite for the compliance service, which previously had none: 216 tests across 16 suites.
- Documentation: `docs/security/authorized-scanning`, `docs/architecture/external-exposure`, and `docs/api/recon`.

### Fixed
- **Socket.IO accepted unauthenticated connections and allowed any client to join any organization's room** (pentest C2), exposing another tenant's alerts and job events to anyone who guessed an organization id. Connections now require the same JWT as the REST API, and room membership is decided server-side from the database.
- **Reflected XSS in `GET /api/auth/callback` leading to account takeover** (pentest C1). The `error` and `error_description` query parameters were interpolated into HTML unescaped, and the API's own CSP allowed inline script. Values are now escaped, the pages redirect with `<meta http-equiv="refresh">` instead of inline script, and `script-src 'unsafe-inline'` has been removed from the API's CSP so nothing reflected there can execute.
- SIEM export was broken: `siemService.fetchEvents` and two queries in the SIEM routes selected `mitre_techniques` from `maes.alerts`, a column that does not exist there. Every export and both event-listing endpoints failed at runtime.
- UEBA alerts had never persisted: the insert passed a bare string into the `source` jsonb column, so it always threw, and the exception was swallowed by a catch that logged at warn level.
- The alert `category` filter was accepted by the route and then silently dropped by the model, so filtering by category returned everything.
- Alert counts in the header were computed from a single page of results, reporting the page size as the total.
- The compliance service's Graph client minted a fresh token on every call and had no paging or 429 handling; it now uses the extractor service's `getAllPages` and `Retry-After`-aware retry.
- PDF rendering left a Chrome process running when a render threw. Rendering is now shared by both report families and always closes the browser.
- The entire API reference section of the documentation failed to render: `sphinxcontrib-httpdomain` was absent while 13 files used its directives. A clean Sphinx build now reports zero errors.
- The Technology Stack table in the documentation overview had a cell wider than its column rule and was dropped from the rendered output.

### Security
- Removed a remote CDN script from the generated compliance HTML report. No interactive component used it, and remote script in a security report is an external dependency worth not having.

## [1.4.0] - 2026-08-07

### Added
- MAES design system, implementing the "MAES Redesign" specification:
  - `frontend/src/theme/tokens.js` — single source of truth for surfaces, hairline borders, the severity ramp, and the repeated style recipes (severity pill, status dot, quiet filter chip).
  - `frontend/src/theme/maesTheme.js` — the spec expressed as an MUI theme, registered as the default theme (`MAES Command`). Because it overrides the shared MUI components, every existing page inherits the new surfaces, density, and control geometry.
  - `frontend/src/components/ui/` — shared primitives: severity pills, status dots, KPI strips, filter chips, progress bars, panels, page headers, evidence rows, timeline rows, and the segmented control.
- Shared time range in the topbar, exposed to screens through `contexts/ShellContext.jsx`.
- `hooks/useSystemHealth.js` — one `/api/health` poller feeding both the topbar status popover and the sidebar health footer.
- Alerts screen: escalate an alert into a case (`POST /api/incidents`), assign to self, and bulk triage over the filtered queue.
- `APP_VERSION` build arg on the frontend image, inlined by Vite and rendered as the sidebar version badge.

### Changed
- Navigation regrouped into Operate / Investigate / Govern in a 224px sidebar with live alert badges, platform health, and identity in the footer. Role-based visibility is unchanged; monitoring and documentation links moved into a collapsible Platform group.
- Topbar reduced to 52px: organization switcher, global search with a working ⌘K shortcut, time range, notifications, health, and help.
- App shell switched from a fixed-margin container to a flex layout that collapses to a single column with an overlay navigation rail below 900px.
- Command Center (dashboard) rebuilt around security posture: an unassigned-critical-first KPI strip, the triage queue as the primary column, collection pipeline and platform health alongside, and a detection trend over the selected range. Each panel now degrades independently, so a permission-gated summary returning 403 no longer blanks the page.
- Alerts rebuilt as a two-pane triage screen: filterable queue plus a detail pane carrying evidence, a lifecycle timeline derived from the alert's own timestamps, and recommended actions. All previous alert operations are preserved.
- Interface font switched from Roboto to Inter, with Roboto Mono for identifiers and metrics, and tabular numerals enabled.

### Removed
- Drag-and-drop dashboard widget layout (`react-grid-layout`) and the fabricated dashboard panels it hosted: randomly generated CPU/memory/disk/network metrics and hardcoded "recent errors" and "container logs" lists. Real service health is reported by `/api/health`; real logs remain at `/system-logs`.

## [1.3.1] - 2026-08-07

### Fixed
- API startup crash under Express 5 / path-to-regexp v8: the compliance module's optional-param route `/controls/:assessmentType?` is no longer valid syntax. Registered both `/controls` and `/controls/:assessmentType` to the same handler so the existing API contract is preserved.
- API `Cannot find module 'uuid'` at boot: `uuid` was only reachable as a hoisted transitive dependency; declared it as a direct dependency (and pinned it via overrides).
- Misleading `Failed to read migrations directory` error on API boot: the optional migration directory is now skipped cleanly when absent (the SQL schema is applied by the postgres init scripts).
- Frontend login blocked by Content-Security-Policy: the auth store fell back to a hardcoded cross-origin `http://localhost:3000` API base; it now uses the same-origin API base proxied by nginx.

## [1.2.0] - 2026-04-13

### Added
- UEBA (User Entity Behavior Analytics) with baseline creation and anomaly detection
- Case Management system for incident response lifecycle
- Automated Playbooks engine with 3 built-in playbooks
- Threat Intelligence integration (VirusTotal, AbuseIPDB, Shodan, IPQualityScore)
- Saved IOCs feature with CRUD tracking
- UEBA Dashboard frontend page
- Incident Management frontend page
- Threat Intelligence frontend page with single/bulk lookup
- Behavior Analytics sidebar navigation

### Fixed
- Duplicate imports and app declarations in api/src/index.js
- Duplicate imports and routes in frontend/src/App.jsx
- Broken menuItems array in frontend/src/components/Sidebar.jsx
- Transaction handling in incidentService.js (proper client-based transactions)
- Route ordering in incidents.js (specific routes before parameterized routes)
- SQL injection in userBehaviorProfile.js getUserCountries() (parameterized query)
- Missing updateBaseline() method in UserBehaviorProfile
- Broken Alert model reference in ueba route (replaced with direct query)
- RBAC permission names in ueba, incidents, and threatIntel routes
- Missing IPQualityScore provider initialization

### Security
- Parameterized SQL queries in UEBA baseline queries
- Proper RBAC enforcement on all new API endpoints
- Rate limiting on all new routes

# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [1.1.0] - 2026-04-13

### Added

- Shared extraction capability registry consumed by API, extractor, and frontend.
- New extraction types for current queueable upstream Microsoft Extractor Suite workflows.
- New extraction parameter support for UAL Graph splitting, UAL filtering, and sign-in `eventType`.
- Release notes for `v1.1.0` in [docs/releases/v1.1.0.md](docs/releases/v1.1.0.md).

### Changed

- Updated extractor bindings to current upstream commands, including `Get-OAuthPermissionsGraph`, `Get-RiskyUsers`, and `Get-AllEvidence`.
- Tightened analyzer routing so only explicitly supported analysis types can run.
- Rewrote the top-level README to be operator-first and security-focused.
- Pinned previously floating Docker base images and normalized production dependency installation in service Dockerfiles.
- Updated frontend and API security headers and reduced permissive CSP/CORS defaults.

### Security

- Upgraded vulnerable production dependencies across all Node services until `npm audit --omit=dev` was clean.
- Removed hardcoded fallback secrets and internal service tokens from runtime code.
- Removed the seeded default admin account from the database bootstrap.
- Changed Docker Compose to require explicit secrets instead of insecure defaults.
- Disabled Docker socket based system-log access by default and made it explicit opt-in.

### Operational Notes

- Existing deployments must provide `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `SERVICE_AUTH_TOKEN`, `ENCRYPTION_KEY`, `CERT_PASSWORD`, and `GRAFANA_PASSWORD`.
- New deployments must create the first administrator through the registration flow.
