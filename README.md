# MAES Platform

MAES is a Microsoft 365 extraction, analysis, reporting, and compliance platform with built-in security operations capabilities including UEBA, case management, automated playbooks, and threat intelligence enrichment.

## Version

- Current release: **v1.3.0**
- Upstream extractor reference: [`invictus-ir/Microsoft-Extractor-Suite`](https://github.com/invictus-ir/Microsoft-Extractor-Suite) (Tier 3 Exchange-only sidecar)
- Upstream analyzer reference: [`LETHAL-FORENSICS/Microsoft-Analyzer-Suite`](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite)

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
- `frontend/`: React UI behind nginx
- `services/extractor/`: Microsoft 365 extraction worker (native Graph API + PowerShell sidecar dispatcher)
- `services/extractor-sidecar/`: PowerShell sidecar for Exchange-only extractions (unified audit log, admin audit, mailbox audit, transport rules, message trace)
- `services/analyzer/`: analysis worker
- `services/compliance/`: compliance assessment worker and report service
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
- [Release Notes: v1.1.0](docs/releases/v1.1.0.md)
- [Release Notes: v1.2.0](docs/releases/v1.2.0.md)

## License

MIT
