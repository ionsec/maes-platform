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
