# MAES: The M365 Analyzer & Extractor Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)

**MAES: The M365 Analyzer & Extractor Suite** is an open-source, full-stack SaaS platform that brings together the best of two proven forensic toolkits—**Microsoft-Analyzer-Suite** and **Microsoft-Extractor-Suite**—into a single, unified solution for acquiring, processing, and investigating Microsoft 365 data at scale.

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
│   Service       │◄──►│   (TimescaleDB) │    │   (Search)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
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

## 🚦 Quick Start

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose
- 8GB+ RAM recommended
- 20GB+ disk space

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/your-org/maes-platform.git
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
- **Default Login**: admin@maes.local / admin123

### First-Time Setup

1. **Change default password** (Security Critical!)
2. **Configure Microsoft 365 connection**
3. **Set up organization details**
4. **Create user accounts**

## 📖 Documentation

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User authentication |
| `/api/extractions` | GET/POST | Data extraction management |
| `/api/analysis` | GET/POST | Analytics and investigations |
| `/api/alerts` | GET/POST | Security alerts and incidents |
| `/api/reports` | GET/POST | Report generation |

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

## 🛠️ Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
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

3. **Start services**:
```bash
# API (Terminal 1)
cd api && npm run dev

# Frontend (Terminal 2)
cd frontend && npm run dev

# Analyzer (Terminal 3)
cd services/analyzer && npm run dev

# Extractor (Terminal 4)
cd services/extractor && npm run dev
```

### Testing

```bash
# Run API tests
cd api && npm test

# Run frontend tests
cd frontend && npm test

# Run integration tests
npm run test:integration
```

## 🔒 Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Session management
- Multi-factor authentication support

### Data Protection
- Encryption at rest and in transit
- Secure credential storage
- Audit logging
- Data retention policies

### Compliance
- GDPR compliance features
- SOC 2 Type II ready
- ISO 27001 alignment
- NIST Cybersecurity Framework

## 📊 Performance

### Scalability
- Horizontal scaling support
- Load balancing ready
- Database sharding capabilities
- Distributed processing

### Monitoring
- Application performance monitoring
- Real-time metrics dashboard
- Alert system integration
- Health check endpoints

## 🔍 Extraction Types

| Type | Description | Data Source |
|------|-------------|-------------|
| `unified_audit_log` | M365 Unified Audit Log | Exchange Online |
| `azure_signin_logs` | Azure AD Sign-in Logs | Azure AD |
| `azure_audit_logs` | Azure AD Audit Logs | Azure AD |
| `mfa_status` | MFA Configuration Status | Azure AD |
| `oauth_permissions` | OAuth App Permissions | Azure AD |
| `risky_users` | Risky Users Detection | Azure AD |
| `mailbox_audit` | Mailbox Audit Logs | Exchange Online |
| `message_trace` | Message Trace Logs | Exchange Online |
| `devices` | Device Registration Data | Azure AD |

## 📊 Analysis Types

| Type | Description | Detections |
|------|-------------|------------|
| `ual_analysis` | Unified Audit Log Analysis | Suspicious activities, policy changes |
| `signin_analysis` | Sign-in Pattern Analysis | AiTM attacks, impossible travel |
| `mfa_analysis` | MFA Configuration Review | Weak MFA, bypass attempts |
| `oauth_analysis` | OAuth App Assessment | Malicious apps, excessive permissions |
| `risky_detection_analysis` | Risk Event Analysis | Account compromises, suspicious activities |

## 🚨 Alert Categories

- **Authentication**: Failed logins, MFA bypasses, suspicious sign-ins
- **Authorization**: Privilege escalations, permission changes
- **Data Access**: Unusual file access, mass downloads
- **Configuration**: Security setting changes, policy modifications
- **Malware**: Malicious file detection, threat indicators
- **Policy Violation**: Compliance violations, unauthorized activities

## 🤝 Contributing

We welcome contributions from the community! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards

- ESLint configuration
- Prettier formatting
- Jest testing framework
- Conventional commits

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Microsoft-Analyzer-Suite**: Advanced PowerShell analytics toolkit
- **Microsoft-Extractor-Suite**: Comprehensive data extraction framework
- **MITRE ATT&CK**: Threat detection and classification framework
- **Open Source Community**: For the amazing tools and libraries

## 📞 Support

- **Documentation**: [docs.maes.local](https://docs.maes.local)
- **Issues**: [GitHub Issues](https://github.com/your-org/maes-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/maes-platform/discussions)
- **Security**: security@maes.local

---

**MAES: The M365 Analyzer & Extractor Suite** - Empowering security teams with comprehensive Microsoft 365 forensic capabilities.