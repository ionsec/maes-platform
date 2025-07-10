# MAES Extractor Service Troubleshooting Guide

## Common Issues and Solutions

### 1. Job Stalling Issues

**Symptoms:**
- Jobs appear to be "stalled" in the queue
- Error messages like "job stalled more than allowable limit"
- Jobs not progressing or completing

**Solutions:**

#### Quick Fix - Restart Service
```bash
# Stop the extractor service
docker-compose stop extractor

# Clear Redis queue (removes all pending jobs)
docker-compose exec redis redis-cli --raw FLUSHDB

# Restart the service
docker-compose up -d extractor

# Check logs
docker-compose logs -f extractor
```

#### Use the Restart Script
```bash
# Run the automated restart script
./services/extractor/restart.sh
```

### 2. PowerShell Module Issues

**Symptoms:**
- PowerShell modules not loading
- Authentication failures
- "Module not found" errors

**Solutions:**

#### Rebuild the Container
```bash
# Rebuild the extractor container
docker-compose build --no-cache extractor

# Restart the service
docker-compose up -d extractor
```

#### Check PowerShell Module Installation
```bash
# Enter the container
docker-compose exec extractor pwsh

# Check installed modules
Get-Module -ListAvailable Microsoft-Extractor-Suite
Get-Module -ListAvailable ExchangeOnlineManagement
```

### 3. Authentication Issues

**Symptoms:**
- "AADSTS700016" errors
- Certificate authentication failures
- Organization not found errors

**Solutions:**

#### Verify Certificate Configuration
1. Ensure certificate files are mounted correctly in `/certs/`
2. Check certificate thumbprint matches Azure AD app registration
3. Verify certificate password is correct

#### Check Azure AD App Permissions
1. Ensure the app has `Exchange.ManageAsApp` permission
2. Verify the app is properly configured in Azure AD
3. Check that the organization FQDN is correct (not Tenant ID)

### 4. Redis Connection Issues

**Symptoms:**
- Queue connection errors
- Jobs not being processed
- Service startup failures

**Solutions:**

#### Check Redis Health
```bash
# Check Redis container status
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

#### Restart Redis
```bash
# Restart Redis service
docker-compose restart redis

# Wait for Redis to be healthy
docker-compose exec redis redis-cli ping
```

### 5. Memory and Performance Issues

**Symptoms:**
- Service becomes unresponsive
- High memory usage
- Slow job processing

**Solutions:**

#### Monitor Resource Usage
```bash
# Check container resource usage
docker stats maes-extractor

# Check logs for memory issues
docker-compose logs extractor | grep -i memory
```

#### Adjust Timeout Settings
Set environment variables in `docker-compose.yml`:
```yaml
environment:
  POWERShell_TIMEOUT: 3600000  # 60 minutes
  QUEUE_STALLED_INTERVAL: 60000  # 1 minute
  LOG_LEVEL: debug  # For detailed logging
```

### 6. File System Issues

**Symptoms:**
- Output files not generated
- Permission errors
- Disk space issues

**Solutions:**

#### Check Volume Mounts
```bash
# Check if volumes are mounted correctly
docker-compose exec extractor ls -la /output
docker-compose exec extractor ls -la /certs
```

#### Fix Permissions
```bash
# Fix output directory permissions
docker-compose exec extractor chown -R extractor:extractor /output
```

### 7. Network Connectivity Issues

**Symptoms:**
- Cannot connect to Microsoft 365
- Timeout errors
- DNS resolution issues

**Solutions:**

#### Test Network Connectivity
```bash
# Test DNS resolution
docker-compose exec extractor nslookup login.microsoftonline.com

# Test HTTPS connectivity
docker-compose exec extractor curl -I https://login.microsoftonline.com
```

#### Check Firewall/Proxy Settings
- Ensure container can reach Microsoft 365 endpoints
- Configure proxy settings if needed
- Check corporate firewall rules

## Monitoring and Debugging

### Enable Debug Logging
```bash
# Set debug log level
export LOG_LEVEL=debug
docker-compose up -d extractor
```

### Check Queue Status
```bash
# View queue health check logs
docker-compose logs extractor | grep "Queue health check"

# Check for stalled jobs
docker-compose logs extractor | grep "stalled"
```

### Monitor Job Progress
```bash
# Follow extraction logs
docker-compose logs -f extractor | grep "extraction"

# Check PowerShell output
docker-compose logs extractor | grep "PowerShell"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `POWERShell_TIMEOUT` | `1800000` | PowerShell command timeout in milliseconds |
| `QUEUE_STALLED_INTERVAL` | `30000` | How often to check for stalled jobs (ms) |
| `QUEUE_MAX_STALLED_COUNT` | `1` | Max stalls before marking job as failed |
| `REDIS_URL` | - | Redis connection string |
| `DATABASE_URL` | - | PostgreSQL connection string |

## Health Checks

The service includes automatic health checks:
- Queue status monitoring every 5 minutes
- Stalled job cleanup every 2 minutes
- PowerShell process timeout handling
- Graceful shutdown on SIGTERM/SIGINT

## Recovery Procedures

### Complete Service Reset
```bash
# Stop all services
docker-compose down

# Clear all volumes (WARNING: This will delete all data)
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build
```

### Database Reset
```bash
# Reset database (WARNING: This will delete all data)
docker-compose down
docker volume rm cira-platform_postgres_data
docker-compose up -d
```

## Getting Help

If issues persist:
1. Check the logs: `docker-compose logs extractor`
2. Review this troubleshooting guide
3. Check the main project documentation
4. Verify all prerequisites are met 