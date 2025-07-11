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
- For production: Custom domain with DNS pointing to your server

### Installation

#### 🏠 Localhost Development (Default)
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform
docker-compose up -d
```

**Access**: https://localhost (accept self-signed certificate)

#### 🌍 Production with Custom Domain
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform

# One-command setup with Let's Encrypt SSL
./scripts/setup-domain.sh maes.yourdomain.com admin@yourdomain.com
```

**Access**: https://maes.yourdomain.com

### Application Access
- **Web Interface**: https://localhost (dev) or https://yourdomain.com (prod)
- **API Documentation**: https://localhost:3000/api/docs
- **Default Login**: admin@maes.local / admin123

## 🔒 SSL & Domain Configuration

MAES supports flexible SSL configuration:

| Mode | Use Case | SSL | Command |
|------|----------|-----|---------|
| **Localhost** | Development | Self-signed | `docker-compose up -d` |
| **Production** | Custom domain | Let's Encrypt | `./scripts/setup-domain.sh domain.com email@domain.com` |
| **Staging** | Testing | Let's Encrypt Staging | `./scripts/setup-domain.sh domain.com email@domain.com --staging` |

### Environment Configuration

Copy and customize the environment file:
```bash
cp .env.example .env
# Edit .env with your domain and settings
```

Key variables:
```bash
DOMAIN=localhost                    # Your domain
USE_LETS_ENCRYPT=false             # Enable Let's Encrypt
EMAIL=admin@yourdomain.com         # Required for Let's Encrypt
```

For detailed setup instructions, see [Domain Setup Guide](docs/DOMAIN_SETUP.md).

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**MAES Platform** - Microsoft 365 Forensic Analysis Made Simple