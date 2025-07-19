# MAES Monitoring Quick Reference

## 🚀 Quick Access URLs

| Service | URL | Login | Purpose |
|---------|-----|-------|---------|
| **Grafana** | https://localhost/grafana/ | admin / admin | Dashboards |
| **Prometheus** | https://localhost/prometheus/ | No auth | Metrics |
| **Live Logs** | MAES Dashboard → Live Container Logs | - | Real-time logs |

## 🔐 Default Credentials

**Grafana**: `admin` / `admin` ⚠️ **Change in production!**

```bash
# Change via environment variables
GRAFANA_USER=your_username
GRAFANA_PASSWORD=your_secure_password
```

## 📊 Key Dashboards

### MAES Platform Overview (Pre-configured)
- **Service CPU**: API, Extractor, Analyzer usage
- **Job Stats**: Extractions, analyses, alerts counters  
- **HTTP Metrics**: Request rates and response times
- **Queue Lengths**: Pending jobs in queues
- **Recent Jobs**: Latest job status and progress
- **Live Errors**: Real-time error feed
- **Container Logs**: Streaming logs with filters

## 🔍 Essential Log Queries

Access via Grafana → Explore → Loki:

```logql
# All errors across services
{container=~"maes-.*"} |= "error"

# API authentication logs  
{container="maes-api"} |= "auth"

# Extraction job failures
{container="maes-extractor"} | json | level="error"

# High-priority alerts
{container=~"maes-.*"} | json | severity="critical"
```

## 📈 Key Metrics to Monitor

### System Health
- `up`: Service availability (should be 1)
- `process_cpu_seconds_total`: CPU usage per service
- `process_memory_bytes`: Memory consumption

### Application Performance  
- `http_requests_total`: Request volume
- `http_request_duration_seconds`: Response times
- `extraction_queue_length`: Job backlog
- `analysis_queue_length`: Analysis backlog

### Business Metrics
- `extraction_jobs_total`: Total extractions by type/status
- `analysis_jobs_total`: Total analyses by type/status  
- `alerts_total`: Security alerts by severity

## 🚨 Common Issues & Quick Fixes

### Service Links Not Working
If clicking Grafana/Prometheus buttons opens empty pages:

```bash
# 1. Check all monitoring services are running
docker ps | grep -E "(grafana|prometheus|loki|cadvisor)"

# 2. Restart nginx if needed
docker restart maes-frontend

# 3. Check nginx configuration syntax
docker exec maes-frontend nginx -t

# 4. Check if services are accessible directly (for debugging)
curl -f http://localhost:3001  # Grafana direct port
curl -f http://localhost:9090  # Prometheus direct port
```

### Grafana Shows "Bad Gateway" or Won't Load
```bash
# Check Grafana status and logs
docker logs maes-grafana

# Verify Grafana is responding
docker exec maes-grafana curl localhost:3000/api/health

# Restart if needed
docker restart maes-grafana
```

### Prometheus Not Accessible
```bash
# Check Prometheus status
docker logs maes-prometheus

# Verify Prometheus web interface
docker exec maes-prometheus curl localhost:9090/-/healthy

# Check configuration
docker exec maes-prometheus promtool check config /etc/prometheus/prometheus.yml
```

### Missing Metrics in Prometheus
```bash
# Check Prometheus targets status
# Go to: https://localhost/prometheus/targets
# All targets should show "UP" in green

# Test API metrics endpoint directly
docker exec maes-api curl localhost:3000/metrics

# Check if services are exposing metrics
docker exec maes-extractor curl localhost:3000/metrics 2>/dev/null || echo "Extractor metrics not available"
docker exec maes-analyzer curl localhost:3000/metrics 2>/dev/null || echo "Analyzer metrics not available"
```

### No Logs in Grafana
```bash
# Check Loki status
docker logs maes-loki

# Check Promtail (log collector)
docker logs maes-promtail

# Test Loki API directly
docker exec maes-loki curl localhost:3100/ready
```

### Network/Proxy Issues
```bash
# Check if nginx can reach monitoring services
docker exec maes-frontend ping maes-grafana
docker exec maes-frontend ping maes-prometheus

# Verify Docker network connectivity
docker network inspect maes-platform_maes-network
```

## ⚡ Performance Tips

### For Production
- Change default Grafana password
- Increase Prometheus retention: `--storage.tsdb.retention.time=90d`
- Set up log sampling for high-volume environments
- Configure alerts for critical metrics

### Resource Monitoring
```bash
# Check container resource usage
docker stats

# Monitor specific service
docker stats maes-grafana maes-prometheus
```

## 🔧 Quick Commands

```bash
# View all monitoring services
docker ps | grep -E "(grafana|prometheus|loki|cadvisor)"

# Follow logs for all monitoring services  
docker logs -f maes-grafana &
docker logs -f maes-prometheus &
docker logs -f maes-loki &

# Restart monitoring stack
docker restart maes-grafana maes-prometheus maes-loki maes-promtail

# Check monitoring service health
curl -f https://localhost/grafana/api/health
curl -f https://localhost/prometheus/-/healthy
```

## 📱 Dashboard Features

### Auto-Refresh Options
- 10s, 30s, 1m, 5m intervals
- Configure via dropdown in top-right

### Time Range Shortcuts
- Last 5m, 15m, 30m, 1h, 6h, 12h, 24h
- Custom range picker available

### Log Filtering
- **All**: Show all log levels
- **Error**: Error-level logs only
- **Warning**: Warning-level logs only  
- **Service**: Filter by specific container

## 🆘 Getting Help

- **Logs**: Check container logs first
- **Documentation**: See `/docs/MONITORING.md` for details
- **Community**: GitHub issues for bug reports
- **Status**: All services status at `docker compose ps`

---
**💡 Pro Tip**: Bookmark https://localhost/grafana/ and login once to save credentials for quick dashboard access!