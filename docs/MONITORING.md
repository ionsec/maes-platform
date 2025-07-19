# MAES Platform Monitoring Guide

## Overview

The MAES platform includes a comprehensive observability stack built on industry-standard tools:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards  
- **Loki**: Log aggregation and search
- **Promtail**: Log collection agent
- **cAdvisor**: Container resource monitoring

## Quick Start

### Accessing Monitoring Services

All services are accessible through the main MAES interface via nginx reverse proxy:

| Service | URL | Credentials | Description |
|---------|-----|-------------|-------------|
| **Grafana** | `https://localhost/grafana/` | `admin` / `admin` | Dashboards and alerts |
| **Prometheus** | `https://localhost/prometheus/` | None | Raw metrics and queries |
| **Loki** | `https://localhost/loki/` | None | Log aggregation API |
| **cAdvisor** | `https://localhost/cadvisor/` | None | Container metrics |

### From MAES Dashboard

The easiest way to access monitoring:

1. Navigate to the MAES Dashboard
2. Click the **"Grafana"** button in the top-right corner
3. Login with `admin` / `admin`
4. Explore pre-configured dashboards

## Default Credentials

### 🔐 Grafana Login

- **Username**: `admin`
- **Password**: `admin`

**⚠️ SECURITY WARNING**: Change these credentials immediately in production!

### Changing Grafana Credentials

#### Method 1: Environment Variables (Recommended)
```bash
# Add to your .env file
GRAFANA_USER=your_secure_username
GRAFANA_PASSWORD=your_secure_password
```

#### Method 2: Through Grafana UI
1. Login to Grafana
2. Go to Administration → Users
3. Click on "admin" user
4. Change password

## Pre-configured Dashboards

### MAES Platform Overview

The main dashboard provides:

#### System Metrics
- **Service CPU Usage**: Real-time CPU utilization for API, Extractor, and Analyzer services
- **Memory Usage**: RAM consumption across the platform
- **System Resources**: CPU, Memory, Disk, and Network utilization bar chart

#### Application Metrics  
- **Job Statistics**: Total extractions, analyses, and alerts counters
- **Recent Jobs**: Table showing latest extraction and analysis jobs with status and progress
- **HTTP Request Rate**: Request volume and response times
- **Queue Lengths**: Pending jobs in extraction and analysis queues

#### Monitoring & Logs
- **Recent Errors & Warnings**: Real-time error feed from all services
- **Live Container Logs**: Streaming logs with filtering capabilities
- **Weekly Activity Trends**: Historical performance charts

### Dashboard Features

- **Auto-refresh**: Updates every 30 seconds by default
- **Time range**: Last hour by default, customizable
- **Filtering**: Log filtering by service or level
- **Drill-down**: Click on metrics for detailed views

## Metrics Reference

### HTTP Metrics
```
http_requests_total - Total HTTP requests
http_request_duration_seconds - Request latency histograms
```

### Job Metrics
```
extraction_jobs_total - Total extraction jobs by type and status
analysis_jobs_total - Total analysis jobs by type and status
extraction_job_duration_seconds - Job processing time
analysis_job_duration_seconds - Analysis processing time
```

### Queue Metrics
```
extraction_queue_length - Jobs waiting in extraction queue
analysis_queue_length - Jobs waiting in analysis queue
```

### System Metrics
```
process_cpu_seconds_total - Process CPU usage
process_memory_bytes - Process memory usage
redis_connections_active - Active Redis connections
database_connections_active - Active database connections
```

### Alert Metrics
```
alerts_total - Security alerts by severity and type
```

## Log Management

### Log Sources

Loki collects logs from:
- **API Service**: HTTP requests, errors, authentication
- **Extractor Service**: Job processing, M365 API calls
- **Analyzer Service**: Analysis results, ML processing
- **Database**: Query logs and errors
- **Redis**: Cache operations
- **System**: Container and Docker logs

### Log Queries

Access logs through Grafana's Explore view or directly via Loki API:

#### Basic Queries
```logql
# All API logs
{container="maes-api"}

# Error logs from all services
{container=~"maes-.*"} |= "error"

# Authentication logs
{container="maes-api"} |= "auth"

# Extraction job logs
{container="maes-extractor"} | json | level="info"
```

#### Advanced Queries
```logql
# Error rate by service
rate({container=~"maes-.*"} |= "error" [5m])

# Failed authentication attempts
{container="maes-api"} | json | message=~".*authentication failed.*"

# Long-running jobs
{container="maes-extractor"} | json | duration > 300
```

### Log Retention

- **Default retention**: 30 days
- **Storage**: Local filesystem in Docker volume
- **Rotation**: Automatic log rotation and cleanup

## Prometheus Configuration

### Scrape Targets

Prometheus automatically discovers and scrapes:

| Target | Endpoint | Metrics |
|--------|----------|---------|
| **API** | `maes-api:3000/metrics` | Application metrics |
| **Extractor** | `maes-extractor:3000/metrics` | Job processing metrics |
| **Analyzer** | `maes-analyzer:3000/metrics` | Analysis metrics |
| **cAdvisor** | `maes-cadvisor:8080/metrics` | Container metrics |
| **Node** | `node-exporter:9100/metrics` | System metrics |

### Custom Metrics

Add custom metrics to your services:

```javascript
const client = require('prom-client');

// Counter example
const requestsTotal = new client.Counter({
  name: 'custom_requests_total',
  help: 'Total custom requests',
  labelNames: ['method', 'endpoint']
});

// Histogram example  
const processingDuration = new client.Histogram({
  name: 'custom_processing_duration_seconds',
  help: 'Processing duration',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Usage
requestsTotal.inc({ method: 'GET', endpoint: '/api/test' });
processingDuration.observe(duration);
```

## Alerting (Advanced)

### Setting Up Alertmanager

1. Add Alertmanager to docker-compose.yml:
```yaml
alertmanager:
  image: prom/alertmanager:latest
  container_name: maes-alertmanager
  ports:
    - "9093:9093"
  volumes:
    - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
```

2. Configure alert rules in Prometheus:
```yaml
# /monitoring/alerts.yml
groups:
  - name: maes_alerts
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
```

### Notification Channels

Configure notifications in Alertmanager:

```yaml
# alertmanager.yml
route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  
receivers:
  - name: 'web.hook'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

## Troubleshooting

### Common Issues

#### Grafana Not Accessible
```bash
# Check Grafana logs
docker logs maes-grafana

# Verify nginx proxy configuration
docker exec maes-frontend nginx -t

# Check if service is running
docker ps | grep grafana
```

#### Missing Metrics
```bash
# Check Prometheus targets
# Go to https://localhost/prometheus/targets

# Verify service metrics endpoints
curl http://localhost:3000/metrics  # API metrics
docker exec maes-api curl localhost:3000/metrics
```

#### Loki Connection Issues
```bash
# Check Loki logs
docker logs maes-loki

# Verify Loki is receiving logs
docker logs maes-promtail
```

### Performance Tuning

#### For High-Volume Environments

1. **Increase retention periods**:
```yaml
# docker-compose.yml
prometheus:
  command:
    - '--storage.tsdb.retention.time=90d'  # Default: 30d
```

2. **Adjust memory limits**:
```yaml
services:
  prometheus:
    deploy:
      resources:
        limits:
          memory: 2G
```

3. **Configure log sampling**:
```yaml
# promtail-config.yml
scrape_configs:
  - job_name: containers
    pipeline_stages:
      - sampling:
          rate: 0.1  # Sample 10% of logs
```

## Security Considerations

### Production Hardening

1. **Change default passwords**:
```bash
GRAFANA_USER=secure_admin
GRAFANA_PASSWORD=very_secure_password_here
```

2. **Restrict network access**:
   - Remove exposed ports in production
   - Use nginx proxy authentication
   - Implement IP whitelisting

3. **Enable HTTPS**:
   - All monitoring services work through nginx HTTPS proxy
   - No additional SSL configuration needed

4. **Secure internal communications**:
   - Use Docker networks for service isolation
   - Implement service-to-service authentication

### Backup Strategy

```bash
# Backup Grafana dashboards and data
docker exec maes-grafana tar czf - /var/lib/grafana > grafana-backup.tar.gz

# Backup Prometheus data
docker exec maes-prometheus tar czf - /prometheus > prometheus-backup.tar.gz
```

## Getting Help

### Log Analysis
- Check container logs: `docker logs <container-name>`
- View real-time logs: `docker logs -f <container-name>`
- Use Grafana log explorer for structured log analysis

### Community Resources
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Loki Documentation](https://grafana.com/docs/loki/)

### MAES-Specific Support
- GitHub Issues: Report monitoring-related issues
- Discord Community: Real-time help and discussion