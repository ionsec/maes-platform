# MAES: The M365 Analyzer & Extractor Suite

<div align="center">
  <img src="MAES_Logo.png" alt="MAES Logo" width="300" />
</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**MAES: The M365 Analyzer & Extractor Suite** is an open-source, full-stack SaaS platform for Microsoft 365 forensic data extraction and analysis.

> **⚠️ This project is heavily under development**

**Built on the amazing work of:**
- [Microsoft-Analyzer-Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite) - Give them a STAR! ⭐
- [Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite) - Give them a STAR! ⭐

## 🚀 Features

- **M365 Data Extraction**: Audit logs, Azure AD, Exchange, SharePoint, Teams
- **Advanced Analytics**: MITRE ATT&CK mapping, behavioral analysis, threat hunting
- **Elasticsearch Integration**: Full-text search and real-time analytics
- **Security & Compliance**: Multi-tenant, RBAC, audit logging
- **Enterprise-Ready**: Docker containerization, microservices architecture

## 🚦 Quick Start

### Prerequisites
- Docker Desktop or Docker Engine
- Docker Compose
- 8GB+ RAM recommended

### Installation

1. **Clone and start**:
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform
docker-compose up -d
```

2. **Access the application**:
- **Web Interface**: http://localhost:8080
- **API Documentation**: http://localhost:3000/api/docs
- **Default Login**: admin@maes.local / admin123

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**MAES Platform** - Microsoft 365 Forensic Analysis Made Simple