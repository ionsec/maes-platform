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
- **Upload & Analyze**: Support for pre-extracted log files (JSON, CSV, TXT, LOG)
- **Elasticsearch Integration**: Full-text search and real-time analytics
- **Security & Compliance**: Multi-tenant, RBAC, audit logging
- **Enterprise-Ready**: Docker containerization, microservices architecture
- **Real-time Progress**: Live analysis progress tracking with WebSocket updates

## 🚦 Quick Start

### Prerequisites
- Docker Desktop or Docker Engine
- Docker Compose
- 8GB+ RAM recommended
- 20GB+ free disk space
- For production: Custom domain with DNS pointing to your server

### Installation

#### 🏠 Localhost Development (Default)
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform
docker-compose up -d --build
```

**Access**: https://localhost (accept self-signed certificate)

#### 🌍 Production with Custom Domain
```bash
git clone https://github.com/ionsec/maes-platform.git
cd maes-platform

# Set up environment variables
cp .env.example .env
# Edit .env with your domain and secure passwords

# One-command setup with Let's Encrypt SSL
./scripts/setup-domain.sh maes.yourdomain.com admin@yourdomain.com
```

**Access**: https://maes.yourdomain.com

### Initial Setup

1. **Apply database migrations** (if needed):
   ```bash
   docker exec -i maes-postgres psql -U maes_user -d maes_db < database/migrations/update_user_roles_fixed.sql
   ```

2. **Access the application**:
   - **Web Interface**: https://localhost (dev) or https://yourdomain.com (prod)
   - **API Documentation**: https://localhost/api/docs (proxied via nginx)
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

**Required environment variables for production:**
```bash
# Domain Configuration
DOMAIN=yourdomain.com              # Your domain (e.g., maes-demo.ionsec.io)
USE_LETS_ENCRYPT=true             # Enable Let's Encrypt
EMAIL=admin@yourdomain.com        # Required for Let's Encrypt

# CORS Configuration (automatically configured based on DOMAIN)
# PUBLIC_IP=1.2.3.4               # Alternative: Use public IP instead of domain
# FRONTEND_URL=https://your-frontend-url.com  # Alternative: Explicit frontend URL
# CORS_ORIGIN=https://domain1.com,https://domain2.com  # Manual override

# Security (CHANGE THESE!)
POSTGRES_PASSWORD=your_secure_postgres_password
REDIS_PASSWORD=your_secure_redis_password
JWT_SECRET=your_jwt_secret_min_32_characters
SERVICE_AUTH_TOKEN=your_service_token
ENCRYPTION_KEY=your-32-character-secret-key-here!

# Database
DATABASE_URL=postgresql://maes_user:your_secure_postgres_password@postgres:5432/maes_db

# Redis
REDIS_URL=redis://:your_secure_redis_password@redis:6379

# API Configuration
NODE_ENV=production
PORT=3000  # Internal port only (not exposed publicly)
API_URL=https://yourdomain.com  # Frontend API URL (nginx proxies /api/ internally)
```

**Frontend configuration (frontend/.env):**
```bash
# Point frontend to your domain (nginx proxies API internally)
VITE_API_URL=https://yourdomain.com
```

## 📊 Using MAES

### M365 Data Extraction
1. **Register an Organization**: Set up Azure AD app registration
2. **Configure Credentials**: Add tenant ID, client ID, and certificate
3. **Run Extractions**: Choose data types (UAL, Azure logs, etc.)
4. **Monitor Progress**: Real-time extraction status

### Analysis & Upload Options

#### Option 1: Direct Analysis (Connected)
- Connect to Microsoft 365 directly
- Extract and analyze in real-time
- Automatic analysis triggering

#### Option 2: Upload Pre-extracted Logs (Standalone)
- Upload existing log files (JSON, CSV, TXT, LOG)
- Support for various M365 log formats
- No M365 connection required

**To upload logs:**
1. Go to **Analysis** page
2. Click **"Upload Logs"**
3. Select data type (UAL, Azure Sign-in, etc.)
4. Choose your log file
5. Set optional metadata (date ranges)
6. Run analysis on uploaded data

**Supported file formats:**
- **JSON**: Native M365 export format
- **CSV**: Tabular log data
- **TXT/LOG**: Plain text logs

### Real-time Features
- **Live Progress Tracking**: See extraction/analysis progress in real-time
- **WebSocket Updates**: Instant status updates across the platform
- **CORS Support**: Works with localhost and custom domains

## 🛠️ Development

### Local Development with Hot-reloading

#### Method 1: Using Development Override (Recommended)
```bash
# Start with development configuration (exposes API port 3000)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Access API directly at: http://localhost:3000/api/docs
# Access frontend at: https://localhost
```

#### Method 2: Manual Development Setup
Add this to your `.env` file:
```bash
API_COMMAND=npm run dev
```

Then restart the API container:
```bash
docker compose restart api
```

**Note**: In production, port 3000 is not exposed publicly. All API requests go through nginx proxy at `/api/`

### Building for Production
```bash
# Build and tag images
docker compose build
docker tag maes-api:latest your-registry/maes-api:latest
docker tag maes-frontend:latest your-registry/maes-frontend:latest
docker tag maes-extractor:latest your-registry/maes-extractor:latest
docker tag maes-analyzer:latest your-registry/maes-analyzer:latest

# Push to registry
docker push your-registry/maes-api:latest
docker push your-registry/maes-frontend:latest
docker push your-registry/maes-extractor:latest
docker push your-registry/maes-analyzer:latest
```

## 🔧 Troubleshooting

### Services Not Starting
- Check logs: `docker compose logs <service-name>`
- Ensure all environment variables are set correctly
- Verify port availability (80, 443, 5432, 6379, 9200)
- **Note**: Port 3000 is internal only (not exposed in production)

### Registration Issues
- Ensure database migrations have been applied
- Check API logs for specific errors
- Verify Azure AD app registration permissions

### Analysis Not Showing Progress
- Check that analysis jobs are created in database
- Verify analyzer service is processing jobs
- Check WebSocket connection in browser dev tools

### Performance Issues
- Adjust Elasticsearch memory: Update `ES_JAVA_OPTS` in docker-compose
- Monitor resource usage: `docker stats`
- Check available disk space for logs and data

### CORS Issues
- **Common error**: "Access to XMLHttpRequest blocked by CORS policy"
- **Solution**: Set `DOMAIN` environment variable to your deployment domain
- **Example**: For deployment on `maes-demo.ionsec.io`:
  ```bash
  DOMAIN=maes-demo.ionsec.io
  API_URL=https://maes-demo.ionsec.io
  ```
- **Frontend**: Ensure `VITE_API_URL=https://maes-demo.ionsec.io` (no port 3000)
- **Alternative**: Use `PUBLIC_IP` for IP-based deployments or `CORS_ORIGIN` for manual override
- **Development**: Use `docker-compose.dev.yml` to expose port 3000 for direct API access
- Check API logs for CORS-related errors: `docker logs maes-api`

## 📋 Backup & Maintenance

### Database Backup
```bash
# Backup PostgreSQL database
docker exec maes-postgres pg_dump -U maes_user maes_db > backup.sql

# Restore database
docker exec -i maes-postgres psql -U maes_user maes_db < backup.sql
```

### Health Monitoring
```bash
# Check all services status
docker compose ps

# View service logs
docker compose logs -f <service-name>

# Monitor resource usage
docker stats
```

### Cleanup
```bash
# Clean up old containers and images
docker system prune -f

# Remove volumes (WARNING: This deletes all data)
docker compose down -v
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**MAES Platform** - Microsoft 365 Forensic Analysis Made Simple