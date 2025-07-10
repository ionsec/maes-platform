# MAES: The M365 Analyzer & Extractor Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.11+-orange.svg)](https://www.elastic.co/)

**MAES: The M365 Analyzer & Extractor Suite** is an open-source, full-stack SaaS platform that brings together the best of two proven forensic toolkits—**Microsoft-Analyzer-Suite** and **Microsoft-Extractor-Suite**—into a single, unified solution for acquiring, processing, and investigating Microsoft 365 data at scale.

> **Developed by [IONSEC.IO Dev Team](https://github.com/ionsec/maes-platform)** - Specializing in Incident Response Services and Cybersecurity Solutions

## 🚀 Key Features

### 📊 **Unified Data Extraction**
- **Microsoft 365 Audit Logs**: Comprehensive audit trail extraction
- **Azure Active Directory**: User activities, sign-ins, and security events
- **Exchange Online**: Email metadata, mailbox access, and message traces
- **SharePoint & OneDrive**: File access, sharing, and collaboration data
- **Teams**: Chat history, meeting records, and file sharing

### 🔍 **Advanced Analytics Engine**
- **MITRE ATT&CK Framework**: Automatic threat technique mapping
- **Behavioral Analysis**: User and entity behavior analytics (UEBA)
- **Timeline Reconstruction**: Chronological event sequencing
- **Threat Hunting**: Advanced query capabilities and search functions
- **Risk Scoring**: Automated risk assessment and prioritization

### 🔎 **Elasticsearch Integration**
- **Full-text Search**: Advanced search across all security data
- **Real-time Analytics**: Live dashboards and metrics
- **Advanced Filtering**: Multi-dimensional data filtering
- **Kibana Dashboards**: Rich visualization and monitoring
- **Bulk Operations**: Efficient data indexing and processing

### 🛡️ **Security & Compliance**
- **Multi-tenant Architecture**: Secure organization isolation
- **Role-based Access Control**: Granular permission management
- **Audit Logging**: Complete activity trail for compliance
- **Data Encryption**: End-to-end encryption for sensitive data
- **GDPR Compliance**: Built-in data privacy controls

### 📈 **Enterprise-Ready**
- **Docker Containerization**: Easy deployment and scaling
- **Microservices Architecture**: Modular and maintainable design
- **Real-time Processing**: Live data streaming and analysis
- **Bulk Operations**: Efficient handling of large datasets
- **API-First Design**: Comprehensive REST API

## 🏗️ Architecture

MAES follows a modern microservices architecture with the following components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Extractor     │
│   (React)       │◄──►│   (Node.js)     │◄──►│   Service       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Analyzer      │    │   PostgreSQL    │    │   Elasticsearch │
│   Service       │◄──►│   (TimescaleDB) │◄──►│   (Search)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       
                       │   Redis         │
                       │   (Cache/Queue) │
                       └─────────────────┘
```

### Components:

- **Frontend**: React-based web application with Material-UI
- **API Gateway**: Node.js/Express REST API server
- **Extractor Service**: PowerShell-based data extraction engine
- **Analyzer Service**: Advanced analytics and threat detection
- **PostgreSQL**: Primary database with TimescaleDB for time-series data
- **Elasticsearch**: Full-text search and log analysis
- **Redis**: Caching and job queue management
- **Kibana**: Data visualization and monitoring

## 🚦 Quick Start

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose
- 8GB+ RAM recommended (12GB+ for Elasticsearch)
- 20GB+ disk space

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform
```

2. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start the platform**:
```bash
docker-compose up -d
```

4. **Access the application**:
- **Web Interface**: http://localhost:8080
- **API Documentation**: http://localhost:3000/api/docs
- **SIEM Integration**: http://localhost:3000/api/siem/events
- **Elasticsearch**: http://localhost:9200
- **Kibana**: http://localhost:5601
- **Default Login**: admin@maes.local / admin123

### First-Time Setup

1. **Change default password** (Security Critical!)
2. **Configure Microsoft 365 connection**
3. **Set up organization details**
4. **Create user accounts**
5. **Initialize Elasticsearch indices**:
```bash
docker exec maes-api npm run elasticsearch:setup
```

## 📖 Documentation

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User authentication |
| `/api/extractions` | GET/POST | Data extraction management |
| `/api/analysis` | GET/POST | Analytics and investigations |
| `/api/alerts` | GET/POST | Security alerts and incidents |
| `/api/reports` | GET/POST | Report generation |
| `/api/elasticsearch/search/*` | GET | Elasticsearch search endpoints |

### Elasticsearch Features

#### 🔍 **Search Capabilities**
```bash
# Search audit logs
curl -X GET "http://localhost:3000/api/elasticsearch/search/audit-logs?q=suspicious&organization_id=your-org-id" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search alerts
curl -X GET "http://localhost:3000/api/elasticsearch/search/alerts?q=brute+force&severity=high" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get analytics
curl -X GET "http://localhost:3000/api/elasticsearch/analytics?organization_id=your-org-id&start_date=2024-01-01&end_date=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 📊 **Kibana Dashboards**
- **Security Overview**: Real-time security metrics
- **User Activity**: User behavior analytics
- **Threat Detection**: Alert analysis and trends
- **System Health**: Service monitoring and performance

### Key Features

#### 🔧 **Data Extraction**
```bash
# Start a new extraction
curl -X POST http://localhost:3000/api/extractions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "unified_audit_log",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

#### 📊 **Analytics**
```bash
# Run behavioral analysis
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user_behavior_analysis",
    "extractionId": "your-extraction-id"
  }'
```

#### 🚨 **Alerts Management**
- **Bulk Operations**: Select multiple alerts for batch processing
- **MITRE ATT&CK Mapping**: Automatic threat technique identification
- **Affected Entities**: Clear visibility of impacted users and resources
- **Evidence Collection**: Comprehensive forensic evidence gathering

#### 🔗 **SIEM Integration**
- **Multi-Format Export**: Splunk, QRadar, Elasticsearch, CEF formats
- **Real-time Streaming**: Live event forwarding to SIEM systems
- **Custom Mappings**: Configurable field mappings for different SIEMs
- **Download Options**: CSV, JSON, XML, CEF file downloads

```bash
# Export events for Splunk
curl -X GET "http://localhost:3000/api/siem/events?format=splunk" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Download events as CSV
curl -X GET "http://localhost:3000/api/siem/download?format=csv" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output security-events.csv
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Elasticsearch 8.11+
- PowerShell 7+ (for extraction services)

### Development Setup

1. **Install dependencies**:
```bash
# API Server
cd api && npm install

# Frontend
cd frontend && npm install

# Services
cd services/analyzer && npm install
cd services/extractor && npm install
```

2. **Database setup**:
```bash
# Start PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_DB=maes_db -e POSTGRES_USER=maes_user -e POSTGRES_PASSWORD=password timescale/timescaledb:latest-pg14

# Run migrations
cd api && npm run migrate
```

3. **Elasticsearch setup**:
```bash
# Start Elasticsearch
docker run -d -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.11.0

# Initialize indices
cd api && npm run elasticsearch:setup
```

### Elasticsearch Development

#### **Index Management**
```bash
# Check index status
curl -X GET "http://localhost:9200/_cat/indices?v"

# View index mapping
curl -X GET "http://localhost:9200/maes-alerts/_mapping"

# Search directly in Elasticsearch
curl -X GET "http://localhost:9200/maes-alerts/_search?q=severity:high"
```

#### **Kibana Development**
1. Access Kibana at http://localhost:5601
2. Create index patterns for:
   - `maes-audit-logs`
   - `maes-alerts`
   - `maes-extractions`
   - `maes-analysis-jobs`
3. Build dashboards and visualizations
4. Set up alerts and monitoring

## 🔧 Configuration

### Elasticsearch Configuration

The platform includes optimized Elasticsearch settings:

- **Memory**: 1GB heap size (configurable)
- **Indices**: Single shard, no replicas for development
- **Analyzers**: Custom text analyzers for security data
- **Mappings**: Optimized field mappings for search performance

### Performance Tuning

For production deployments:

1. **Increase Elasticsearch memory**:
```yaml
# In docker-compose.yml
ES_JAVA_OPTS: "-Xms2g -Xmx2g"
```

2. **Add more replicas**:
```javascript
// In elasticsearch service
number_of_replicas: 1
```

3. **Configure index lifecycle management**:
```javascript
// Automatic index management
await client.ilm.putLifecycle({
  policy: 'maes-policy',
  body: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '50GB',
              max_age: '1d'
            }
          }
        }
      }
    }
  }
});
```

## 🚀 Deployment

### Production Deployment

1. **Update environment variables**:
```bash
# Production .env
NODE_ENV=production
ELASTICSEARCH_URL=https://your-elasticsearch-cluster:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your-secure-password
```

2. **Scale services**:
```bash
# Scale API instances
docker-compose up -d --scale api=3

# Scale analyzer instances
docker-compose up -d --scale analyzer=2
```

3. **Monitor performance**:
```bash
# Check service health
docker-compose ps

# View logs
docker-compose logs -f elasticsearch
docker-compose logs -f api
```

### Backup and Recovery

1. **Backup Elasticsearch data**:
```bash
# Create snapshot
curl -X PUT "localhost:9200/_snapshot/maes_backup/snapshot_1"

# Restore snapshot
curl -X POST "localhost:9200/_snapshot/maes_backup/snapshot_1/_restore"
```

2. **Backup PostgreSQL data**:
```bash
docker exec maes-postgres pg_dump -U maes_user maes_db > backup.sql
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [API Docs](http://localhost:3000/api/docs)
- **Issues**: [GitHub Issues](https://github.com/ionsec/maes-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ionsec/maes-platform/discussions)

## 🔗 Links

- **Website**: [https://ionsec.io](https://ionsec.io)
- **Documentation**: [https://docs.ionsec.io](https://docs.ionsec.io)
- **Blog**: [https://blog.ionsec.io](https://blog.ionsec.io)

---

**MAES Platform** - Empowering Security Teams with Advanced Microsoft 365 Forensics