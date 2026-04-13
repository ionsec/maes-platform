# MAES Platform

MAES is a Microsoft 365 extraction, analysis, reporting, and compliance platform built around queue-driven services for API, extractor, analyzer, compliance, and frontend delivery.

This release aligns the platform with current upstream extractor/analyzer capabilities and hardens the deployment for production use.

## Version

- Current release target: `v1.1.0`
- Upstream extractor reference: [`invictus-ir/Microsoft-Extractor-Suite`](https://github.com/invictus-ir/Microsoft-Extractor-Suite)
- Upstream analyzer reference: [`LETHAL-FORENSICS/Microsoft-Analyzer-Suite`](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite)

## What Changed In v1.1.0

- Added a shared extraction capability registry used by API, extractor, and frontend.
- Updated extractor command bindings to current upstream cmdlets.
- Expanded supported extraction types and parameter handling.
- Removed seeded default credentials from the database bootstrap.
- Removed insecure fallback secrets from runtime code and `docker-compose.yml`.
- Upgraded vulnerable Node dependencies and regenerated lockfiles until production `npm audit` was clean.
- Pinned previously floating container base images and hardened the service Dockerfiles.
- Disabled Docker socket based system-log access by default. It is now explicit opt-in.

See [CHANGELOG.md](CHANGELOG.md) and [docs/releases/v1.1.0.md](docs/releases/v1.1.0.md) for release notes.

## Architecture

- `api/`: authentication, orchestration, uploads, reporting, and internal service APIs
- `frontend/`: React UI behind nginx
- `services/extractor/`: Microsoft 365 extraction worker
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
- There is no seeded `admin@maes.local / admin123` account anymore.

Copy the baseline from [.env.example](.env.example) and replace every placeholder before deployment.

## Deployment

1. Clone the repository.
2. Create `.env` from `.env.example`.
3. Fill in all required secrets.
4. Start the stack:

```bash
docker compose up -d --build
```

5. Open the platform at `https://localhost` for local deployment, or your configured domain for production.
6. Create the first administrator account through the registration flow.

## First-Time Setup

- Register the first user through the MAES UI.
- Complete onboarding and create the first organization.
- Configure Microsoft Entra / Microsoft 365 application credentials.
- Upload a certificate or use the extractor-managed default certificate.
- Run a connection test before scheduling extractions.

## Security Posture

This release intentionally changes startup behavior:

- Services now fail fast when required secrets are missing.
- The database bootstrap no longer seeds a default admin account.
- The API no longer accepts hardcoded fallback internal service tokens.
- Docker-based system log collection is disabled unless `ENABLE_DOCKER_LOGS=true` is set and Docker access is mounted explicitly.
- CSP and CORS defaults are tighter in production mode.
- Previously floating container image references are pinned.

## Optional Docker Log Access

System log collection from Docker containers is no longer enabled by default.

If you explicitly want it:

1. Set `ENABLE_DOCKER_LOGS=true` in the API environment.
2. Restore a read-only Docker socket mount for the API service.
3. Accept that this increases the privilege level of that container.

If you do not enable it, `/api/system/logs` returns `503` instead of silently attempting Docker access.

## Verification

The security remediation for `v1.1.0` was verified with:

- `npm audit --omit=dev --json` in `api/`, `frontend/`, `services/analyzer/`, `services/extractor/`, and `services/compliance/`
- frontend production build
- syntax checks on modified service files

Container image scanning via Docker Scout requires authenticated Docker access in the execution environment. Base-image pinning and Dockerfile hardening were applied in-repo regardless.

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

## License

MIT
