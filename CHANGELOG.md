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
