# CIRA Platform Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- At least 8GB of RAM available
- 20GB of free disk space

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cira-platform
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set secure passwords and tokens.

3. **Build and start the services**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Apply database migrations (if needed)**
   ```bash
   docker exec -i maes-postgres psql -U maes_user -d maes_db < database/migrations/update_user_roles_fixed.sql
   ```

5. **Access the application**
   - Frontend: http://localhost:8080
   - API: http://localhost:3000
   - Elasticsearch: http://localhost:9200

## Development Setup

For local development with hot-reloading:

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Production Deployment

### Using Pre-built Images

1. Build and tag images:
   ```bash
   docker compose -f docker-compose.prod.yml build
   docker tag maes-api:latest your-registry/maes-api:latest
   docker tag maes-frontend:latest your-registry/maes-frontend:latest
   docker tag maes-extractor:latest your-registry/maes-extractor:latest
   docker tag maes-analyzer:latest your-registry/maes-analyzer:latest
   ```

2. Push to registry:
   ```bash
   docker push your-registry/maes-api:latest
   docker push your-registry/maes-frontend:latest
   docker push your-registry/maes-extractor:latest
   docker push your-registry/maes-analyzer:latest
   ```

3. On production server, update docker-compose.prod.yml to use registry images.

### Environment Variables

Required environment variables:

- `POSTGRES_PASSWORD`: PostgreSQL password
- `REDIS_PASSWORD`: Redis password
- `JWT_SECRET`: JWT signing secret (min 32 chars)
- `SERVICE_AUTH_TOKEN`: Inter-service auth token
- `ENCRYPTION_KEY`: Encryption key (exactly 32 chars)

### Health Checks

All services include health checks. Monitor service health:

```bash
docker compose -f docker-compose.prod.yml ps
```

### Backup and Restore

Backup PostgreSQL database:
```bash
docker exec maes-postgres pg_dump -U maes_user maes_db > backup.sql
```

Restore database:
```bash
docker exec -i maes-postgres psql -U maes_user maes_db < backup.sql
```

## Troubleshooting

### Services not starting
- Check logs: `docker compose -f docker-compose.prod.yml logs <service-name>`
- Ensure all environment variables are set correctly
- Verify port availability

### Registration issues
- Ensure database migrations have been applied
- Check API logs for specific errors

### Performance issues
- Adjust Elasticsearch memory: Update `ES_JAVA_OPTS` in docker-compose
- Monitor resource usage: `docker stats`