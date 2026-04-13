# Environment Variables

Use [.env.example](../.env.example) as the source template.

## Required Secrets

These values must be set before `docker compose up`:

```bash
POSTGRES_PASSWORD=
REDIS_PASSWORD=
JWT_SECRET=
SERVICE_AUTH_TOKEN=
ENCRYPTION_KEY=
CERT_PASSWORD=
GRAFANA_PASSWORD=
```

Recommended generation:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD / REDIS_PASSWORD
openssl rand -hex 32   # JWT_SECRET / SERVICE_AUTH_TOKEN / ENCRYPTION_KEY / CERT_PASSWORD / GRAFANA_PASSWORD
```

Rules:

- `ENCRYPTION_KEY` must be at least 32 characters.
- `SERVICE_AUTH_TOKEN` must be the same across internal services.
- `CERT_PASSWORD` protects the default extractor certificate bundle.

## Common Runtime Settings

```bash
DOMAIN=localhost
API_URL=https://localhost
FRONTEND_URL=https://localhost
NODE_ENV=production
USE_LETS_ENCRYPT=false
LETSENCRYPT_STAGING=false
ENABLE_DOCKER_LOGS=false
SIEM_EXPORT_LIMIT=1000
SIEM_RATE_LIMIT=50
POWERSHELL_TIMEOUT=1800000
QUEUE_STALLED_INTERVAL=30000
QUEUE_MAX_STALLED_COUNT=1
```

## Threat Intelligence (Optional)

Configure these to enable external IOC enrichment. Without them, enrichment endpoints return empty results but the platform runs normally.

```bash
VIRUSTOTAL_API_KEY=         # VirusTotal — file hash and domain reputation
ABUSEIPDB_API_KEY=          # AbuseIPDB — IP reputation and abuse confidence
SHODAN_API_KEY=             # Shodan — IP exposure, open ports, vulnerabilities
IPQUALITYSCORE_API_KEY=     # IPQualityScore — fraud and abuse scoring
```

All four providers are optional and independent. Enrichment results are cached in memory for 1 hour with a 1000-entry cap.

## Notes

- `ENABLE_DOCKER_LOGS=false` keeps the API container unprivileged by default.
- In production, prefer `https://` origins and avoid broad `CORS_ORIGIN` values.
- The platform no longer ships with a seeded default administrator account.
- `DOMAIN`: Sets the primary domain for the application.
- `CORS_ORIGIN`: Optional override for specific CORS origins (comma-separated).
- `API_URL`: Used by frontend to determine API endpoint.

## Health Checks

The Docker Compose configuration includes health checks for:
- PostgreSQL database
- Redis cache
- Elasticsearch search engine

These ensure services are ready before starting the API.
