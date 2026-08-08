# MAES Platform

MAES is a Microsoft 365 extraction, analysis, reporting, and compliance platform with built-in security operations capabilities including UEBA, case management, automated playbooks, and threat intelligence enrichment.

## Version

- Current release: **v1.5.0**
- Upstream extractor reference: [`invictus-ir/Microsoft-Extractor-Suite`](https://github.com/invictus-ir/Microsoft-Extractor-Suite) (Tier 3 Exchange-only sidecar)
- Upstream analyzer reference: [`LETHAL-FORENSICS/Microsoft-Analyzer-Suite`](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite)

## What's New in v1.5.0

Assessment release. MAES can now see a tenant from the outside as well as the inside.

### External Exposure Scanning

A domain-seeded attack surface assessment that runs without credentials — the view an attacker has before they have anything. Eleven phases across three profiles: tenant fingerprinting, DNS and mail authentication, certificate transparency, dangling-DNS detection, AD FS endpoint exposure, anonymous Azure and Microsoft 365 access, and, at the aggressive tier, account-existence and third-party SaaS checks. Findings are chained into attack paths, compared scan over scan, and reported in HTML, PDF, JSON, or CSV.

Because scans send real traffic to systems outside MAES, they are governed rather than merely offered: a recorded scope authorization with a profile ceiling and mandatory expiry, re-checked every time a scan runs; a complete audit trail of every probe; and centralised rate limiting that scan phases cannot bypass. Read [Authorized Scanning](docs/security/authorized-scanning.rst) before running one.

### MAES Entra ID Posture Controls

Sixteen new authenticated controls covering identity exposure the CIS benchmark does not reach — federation and AD FS surface, legacy authentication and ROPC, MFA coverage including phishing-resistant methods for privileged roles, Conditional Access gaps, service principal privilege, and mail authentication. The compliance engine now runs 25 automated checks, up from 9.

### Alerting

New high and critical exposures raise alerts, deduplicated against the previous scan so that standing findings do not re-alert every run. Alerts now also push over websockets rather than waiting for a poll, and per-user read state finally exists.

### Security Fixes

Two confirmed critical vulnerabilities were fixed: unauthenticated cross-tenant access through Socket.IO, and a reflected XSS in the admin-consent callback that could be escalated to account takeover. See the [changelog](CHANGELOG.md) for the full list, which also covers a broken SIEM export and a UEBA alerting path that had never once persisted an alert.

## What's New in v1.4.0

Interface release implementing the MAES redesign. No API or extraction behavior changes.

### Design System
A single source of truth for the interface: design tokens (`frontend/src/theme/tokens.js`), an MUI theme built from them (`frontend/src/theme/maesTheme.js`, registered as the default `MAES Command` theme), and shared primitives in `frontend/src/components/ui/` — severity pills, status dots, KPI strips, filter chips, panels, and evidence/timeline rows. Because the theme overrides the shared MUI components, every screen inherits the new surfaces, density, and control geometry.

### Command Center
The dashboard is now organized around security posture rather than widgets: an unassigned-critical-first KPI strip, the triage queue as the primary column, collection pipeline and platform health alongside, and a detection trend over the selected time range. Panels degrade independently, so a permission-gated summary returning 403 no longer blanks the page.

The previous drag-and-drop widget board was removed along with the fabricated panels it hosted — randomly generated CPU/memory/disk/network figures and hardcoded "recent errors" and "container logs" lists. Real service health comes from `/api/health`; real logs remain at `/system-logs`.

### Two-Pane Alert Triage
Alerts is a filterable queue beside a detail pane carrying evidence, a lifecycle timeline derived from the alert's own timestamps, and recommended actions. Adds assign-to-self, bulk triage over the filtered queue, and escalation of an alert into a case.

### Navigation
Regrouped into Operate / Investigate / Govern in a 224px sidebar with live alert badges, platform health, and identity in the footer. The topbar is reduced to 52px with an organization switcher, global search (⌘K), the shared time range, notifications, and help. Role-based visibility is unchanged. Below 900px the layout collapses to a single column with an overlay navigation rail.

See [CHANGELOG.md](CHANGELOG.md) for full details.

## What's New in v1.3.1

Bug-fix release restoring clean boot and login on fresh deployments:

- **API boots from a clean build.** Fixed a crash under Express 5 / path-to-regexp v8 in the compliance module (the optional-param route `/controls/:assessmentType?` is no longer valid syntax), and added the previously-undeclared `uuid` runtime dependency.
- **Cleaner startup logs.** The optional API migration directory is now skipped gracefully when absent (the SQL schema is applied by the postgres init scripts).
- **Frontend login no longer blocked by CSP.** The auth store now uses the same-origin API base (proxied by nginx via `/api/*`) instead of a hardcoded cross-origin `http://localhost:3000`.

## What's New in v1.3.0

### Native Graph API Extraction Engine
The extractor service now calls Microsoft Graph API directly via `@azure/msal-node` + `@microsoft/microsoft-graph-client` for 23 of 28 extraction types, eliminating the PowerShell runtime dependency and reducing the Docker image by ~300-500 MB. A lightweight PowerShell sidecar (`extractor-sidecar`) handles the 5 Exchange-only types that have no Graph API equivalent.

### Dual-Path Extraction Architecture
| Path | Types | Implementation |
|------|-------|---------------|
| Tier 1 — Native Graph | 20 types (sign-in logs, audit logs, MFA, devices, groups, licenses, conditional access, PIM, risky users, etc.) | Direct Graph SDK calls with `@odata.nextLink` pagination and 429 rate limit retry |
| Tier 2 — Partial Graph | 3 types (mailbox rules, mailbox audit status, mailbox permissions) | Graph API with documented limitations |
| Tier 3 — PowerShell Sidecar | 5 types (unified audit log, admin audit log, mailbox audit, transport rules, message trace) | HTTP API sidecar running `Microsoft-Extractor-Suite` |

### Native Certificate Parsing
PFX/PKCS12 certificate validation in the API service now uses `node-forge` instead of spawning `pwsh`. Certificate thumbprint, expiry, and private key extraction are handled entirely in JavaScript.

### Event-Driven Progress Tracking
Replaced stdout regex parsing with a `ProgressTracker` class that updates BullMQ job progress through phase-based events (authenticating, fetching, paginating, writing).

### Output Format v2.0
Native Graph extractors produce output in Graph API's native JSON format with a metadata envelope (format version, extraction type, timestamp, record count) for format detection by downstream services.

See [CHANGELOG.md](CHANGELOG.md) for full details.

## What's New in v1.2.0

### UEBA (User Entity Behavior Analytics)
Behavioral baselines built from 30-day audit history, with geographic, temporal, and operational anomaly detection. Risk scores (0–100) drive automated recommendations and high-risk alerting.

### Case Management
Full incident lifecycle — new → investigating → contained → resolved → closed — with timeline tracking, evidence management, and user assignment.

### Automated Playbooks
Three built-in playbooks (Compromised Account, Phishing Email, Privileged Access Abuse) with approval gates for destructive actions and database-backed execution tracking.

### Threat Intelligence Integration
Multi-provider IOC enrichment (VirusTotal, AbuseIPDB, Shodan, IPQualityScore) for IPs, domains, and file hashes. Saved IOC tracking with risk-level classification and 1-hour caching.

### Bug Fixes
- Eliminated duplicate `require()` calls and duplicate `app` declarations that would crash startup
- Fixed broken sidebar menu array, duplicate frontend routes, and duplicate imports
- Replaced insecure `pool.query('BEGIN')` transactions with proper client-based transactions
- Parameterized SQL query in `getUserCountries()` (was injectable)
- Fixed route ordering so `/stats/summary` and `/meta/playbooks` match before `/:id`
- Aligned RBAC permission names across all new routes to the actual system permissions

See [CHANGELOG.md](CHANGELOG.md) and [docs/releases/v1.2.0.md](docs/releases/v1.2.0.md) for full details.

## Architecture

- `api/`: authentication, orchestration, uploads, reporting, UEBA, incidents, threat intel
- `frontend/`: React UI behind nginx (`src/theme/` design tokens and themes, `src/components/ui/` shared primitives)
- `services/extractor/`: Microsoft 365 extraction worker (native Graph API + PowerShell sidecar dispatcher)
- `services/extractor-sidecar/`: PowerShell sidecar for Exchange-only extractions (unified audit log, admin audit, mailbox audit, transport rules, message trace)
- `services/analyzer/`: analysis worker
- `services/compliance/`: compliance assessment worker, external exposure scanner (`src/recon/`), and report service
- `database/`: bootstrap schema and migrations
- `shared/`: capability metadata used across services

## Prerequisites

- Docker Engine with Compose support
- Microsoft 365 tenant credentials for extraction/compliance workflows
- A `.env` file with explicit secrets

## Required Secrets

Set these in `.env` before starting the stack:

```bash
POSTGRES_PASSWORD=
REDIS_PASSWORD=
JWT_SECRET=
SERVICE_AUTH_TOKEN=
ENCRYPTION_KEY=
CERT_PASSWORD=
GRAFANA_PASSWORD=
```

Recommended generation commands:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD / REDIS_PASSWORD
openssl rand -hex 32   # JWT_SECRET / SERVICE_AUTH_TOKEN / ENCRYPTION_KEY / CERT_PASSWORD / GRAFANA_PASSWORD
```

Notes:

- `ENCRYPTION_KEY` must be at least 32 characters.
- `SERVICE_AUTH_TOKEN` is required for internal API calls between services.
- `CERT_PASSWORD` protects the default extractor certificate bundle.
- There is no seeded `admin@maes.local / admin123` account.

## Optional Threat Intelligence API Keys

These enable external IOC enrichment; the platform runs without them (enrichment endpoints return empty results):

```bash
VIRUSTOTAL_API_KEY=        # VirusTotal file hash and domain reputation
ABUSEIPDB_API_KEY=         # AbuseIPDB IP reputation
SHODAN_API_KEY=            # Shodan IP exposure and vulnerability data
IPQUALITYSCORE_API_KEY=    # IPQualityScore fraud and abuse scoring
```

## Deployment

1. Clone the repository.
2. Create `.env` from `.env.example`.
3. Fill in all required secrets.
4. Start the stack:

```bash
docker compose up -d --build
```

5. Apply database migrations:

```bash
docker compose exec -T postgres psql -U maes_user -d maes_db \
  < database/migrations/007_add_ueba_incidents_playbooks.sql
docker compose exec -T postgres psql -U maes_user -d maes_db \
  < database/migrations/008_add_saved_iocs.sql
```

6. Open the platform at `https://localhost` for local deployment, or your configured domain for production.
7. Create the first administrator account through the registration flow.

## First-Time Setup

- Register the first user through the MAES UI.
- Complete onboarding and create the first organization.
- Configure Microsoft Entra / Microsoft 365 application credentials.
- Upload a certificate or use the extractor-managed default certificate.
- Run a connection test before scheduling extractions.
- Optionally configure threat intelligence API keys in `.env` for IOC enrichment.

## API Endpoints

### Authentication & Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate user |
| `GET` | `/api/extractions` | List extractions |
| `POST` | `/api/extractions` | Start extraction |
| `GET` | `/api/analysis` | List analysis jobs |
| `POST` | `/api/analysis` | Create analysis job |
| `GET` | `/api/alerts` | List security alerts |
| `GET` | `/api/reports` | List reports |

### External Exposure

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/recon/scan/:organizationId` | Start a scan (`passive`, `standard`, `aggressive`) |
| `GET` | `/api/recon/scans/:organizationId` | List scans |
| `GET` | `/api/recon/scan/:scanId` | Scan detail with findings and attack paths |
| `GET` | `/api/recon/scan/:scanId/probe-log` | Every probe the scan issued |
| `GET` | `/api/recon/compare/:baselineId/:currentId` | Drift between two scans |
| `POST` | `/api/recon/scan/:scanId/report` | Generate a report |
| `POST` | `/api/recon/authorizations/:organizationId` | Record a scope authorization |
| `POST` | `/api/recon/schedules/:organizationId` | Schedule a recurring scan |

### UEBA

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ueba/baseline/:userId` | Get user behavior baseline |
| `GET` | `/api/ueba/risk/:userId` | Get user risk score |
| `GET` | `/api/ueba/baselines` | List all baselines |
| `POST` | `/api/ueba/process-activity` | Process activity for anomalies |
| `GET` | `/api/ueba/stats` | UEBA statistics |

### Incident Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/incidents` | List incidents |
| `POST` | `/api/incidents` | Create incident |
| `GET` | `/api/incidents/stats/summary` | Incident statistics |
| `GET` | `/api/incidents/meta/playbooks` | List available playbooks |
| `GET` | `/api/incidents/:id` | Get incident details |
| `PUT` | `/api/incidents/:id/status` | Update incident status |
| `PUT` | `/api/incidents/:id/assign` | Assign incident |
| `POST` | `/api/incidents/:id/evidence` | Add evidence |
| `POST` | `/api/incidents/:id/playbook` | Execute playbook |

### Threat Intelligence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/threat-intel/enrich/ip/:ip` | Enrich IP address |
| `GET` | `/api/threat-intel/enrich/domain/:domain` | Enrich domain |
| `GET` | `/api/threat-intel/enrich/hash/:hash` | Enrich file hash |
| `POST` | `/api/threat-intel/enrich/bulk` | Bulk enrichment |
| `GET` | `/api/threat-intel/stats` | Provider status and cache size |
| `GET` | `/api/threat-intel/saved` | List saved IOCs |
| `POST` | `/api/threat-intel/saved` | Save an IOC |
| `DELETE` | `/api/threat-intel/saved/:id` | Delete saved IOC |

## Security Posture

- Services fail fast when required secrets are missing.
- No seeded default admin account.
- No hardcoded fallback internal service tokens.
- Docker log collection is disabled unless explicitly enabled.
- CSP and CORS defaults are tight in production mode.
- Container image references are pinned.
- All SQL queries use parameterized inputs.
- All new API endpoints enforce RBAC permissions and rate limiting.
- Websocket connections are authenticated and organization room membership is decided server-side.
- External exposure scans require a recorded scope authorization, identify themselves honestly, are rate limited, and log every probe they issue.

## Optional Docker Log Access

System log collection from Docker containers is not enabled by default. To enable it:

1. Set `ENABLE_DOCKER_LOGS=true` in the API environment.
2. Restore a read-only Docker socket mount for the API service.
3. Accept that this increases the privilege level of that container.

If you do not enable it, `/api/system/logs` returns `503`.

## Development

- Frontend: `cd frontend && npm install && npm run dev`
- API: `cd api && npm install && npm run dev`
- Services: run their respective `npm install` and `npm start` commands

For local development, you may set development-only origins with `CORS_ORIGIN` or run with `NODE_ENV=development`.

## Documentation

- [Environment Variables](docs/ENVIRONMENT_VARIABLES.md)
- [Domain Setup](docs/DOMAIN_SETUP.md)
- [Monitoring](docs/MONITORING.md)
- [Monitoring Quick Reference](docs/MONITORING_QUICK_REFERENCE.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Authorized Scanning](docs/security/authorized-scanning.rst)
- [External Exposure Architecture](docs/architecture/external-exposure.rst)
- [Release Notes: v1.1.0](docs/releases/v1.1.0.md)
- [Release Notes: v1.2.0](docs/releases/v1.2.0.md)

## License

MIT
