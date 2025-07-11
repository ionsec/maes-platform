# Environment Variables Configuration

## Required Environment Variables

Copy these variables to your `.env` file for Docker deployment:

```bash
# Database Configuration
POSTGRES_PASSWORD=maes_secure_password
DATABASE_URL=postgresql://maes_user:maes_secure_password@postgres:5432/maes_db

# Redis Configuration
REDIS_PASSWORD=redis_secure_password
REDIS_URL=redis://:redis_secure_password@redis:6379

# Elasticsearch Configuration
ELASTICSEARCH_URL=http://elasticsearch:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=

# JWT Configuration
JWT_SECRET=your_jwt_secret_here_change_in_production
JWT_EXPIRY=24h

# Service Authentication
SERVICE_AUTH_TOKEN=service_internal_token_change_in_production

# Encryption
ENCRYPTION_KEY=your-32-character-secret-key-here!

# API Configuration
NODE_ENV=production
PORT=3000
API_URL=http://localhost:3000

# CORS Configuration
# Optional: Specific CORS origin override (if not set, will auto-detect based on DOMAIN)
CORS_ORIGIN=
# Domain for the application (used for CORS and SSL)
DOMAIN=localhost
# Frontend URL (for development and documentation)
FRONTEND_URL=http://localhost:8080

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# File Upload
MAX_FILE_SIZE=100mb
UPLOAD_PATH=uploads

# SIEM Integration
SIEM_EXPORT_LIMIT=1000
SIEM_RATE_LIMIT=50

# Security
HELMET_ENABLED=true
COMPRESSION_ENABLED=true
```

## Docker Deployment

1. Create a `.env` file in the root directory
2. Copy the variables above and update the values
3. Run `docker-compose up -d`

## Security Notes

- **JWT_SECRET**: Use a strong, random string in production
- **ENCRYPTION_KEY**: Must be exactly 32 characters
- **SERVICE_AUTH_TOKEN**: Change in production for internal service communication
- **POSTGRES_PASSWORD**: Use a strong password
- **REDIS_PASSWORD**: Use a strong password

## Development vs Production

For development, you can use the default values. For production:

1. Generate strong passwords for all secrets
2. Use HTTPS URLs for API_URL and CORS_ORIGIN
3. Set NODE_ENV=production
4. Configure proper logging levels
5. Set appropriate rate limits

## SIEM Integration Variables

The new SIEM integration features use these variables:

- `SIEM_EXPORT_LIMIT`: Maximum events to export (default: 1000)
- `SIEM_RATE_LIMIT`: Rate limit for SIEM exports (default: 50 requests/minute)

## Elasticsearch Configuration

The Elasticsearch integration uses these variables:

- `ELASTICSEARCH_URL`: Elasticsearch server URL (default: http://elasticsearch:9200)
- `ELASTICSEARCH_USERNAME`: Elasticsearch username (optional, for authentication)
- `ELASTICSEARCH_PASSWORD`: Elasticsearch password (optional, for authentication)

## CORS and Domain Configuration

The application now supports dynamic CORS configuration based on the deployment environment:

### Automatic CORS Origins
The API automatically allows the following origins:
- `localhost` with various ports (for development)
- The domain specified in `DOMAIN` environment variable
- Any explicit `CORS_ORIGIN` if provided

### Public IP to Localhost Redirects
The application handles scenarios where:
1. Frontend is accessed via public IP
2. User gets redirected to localhost (common in development)
3. API calls work properly despite the domain change

### Environment Variables for CORS
- `DOMAIN`: Sets the primary domain for the application
- `CORS_ORIGIN`: Optional override for specific CORS origin
- `API_URL`: Used by frontend to determine API endpoint

## Health Checks

The Docker Compose configuration includes health checks for:
- PostgreSQL database
- Redis cache
- Elasticsearch search engine

These ensure services are ready before starting the API. 