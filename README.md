# MAES: The M365 Analyzer & Extractor Suite

<div align="center">
  <img src="MAES_Logo.png" alt="MAES Logo" width="300" />
</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**MAES: The M365 Analyzer & Extractor Suite** is an open-source, full-stack SaaS platform for Microsoft 365 forensic data extraction, analysis, and comprehensive compliance assessment.

> **⚠️ This project is heavily under development**

**Built on the amazing work of:**
- [Microsoft-Analyzer-Suite](https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite) - Give them a STAR! ⭐
- [Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite) - Give them a STAR! ⭐

## 🚀 Features

### Core Capabilities
- **M365 Data Extraction**: Audit logs, Azure AD, Exchange, SharePoint, Teams, UAL Graph, Licenses
- **Advanced Analytics**: MITRE ATT&CK mapping, behavioral analysis, threat hunting
- **Upload & Analyze**: Support for pre-extracted log files (JSON, CSV, TXT, LOG)
- **Real-time Progress**: Live analysis progress tracking with WebSocket updates

### Compliance & Assessment
- **Comprehensive Compliance Assessment**: CIS Microsoft 365 v4.0.0 benchmark implementation
- **Certificate-Based Authentication**: Secure Microsoft Graph API integration using X.509 certificates
- **Detailed Tenant Analysis**: Complete organizational security posture evaluation including:
  - **Technical Characteristics**: Tenant info, DNS domains, synchronization status, external tenant connections
  - **Account Analysis**: User types (guests, members, external), password policies, account status breakdown
  - **Group & Application Inventory**: Security groups, distribution lists, privileged roles, third-party applications
  - **Failing Entity Identification**: Specific users, groups, and policies that fail compliance requirements
- **Comprehensive Reporting**: Executive summaries, detailed HTML reports, and failing entity remediation guidance
- **API Permission Validation**: Pre-assessment validation of required Graph API permissions

### Enterprise Platform
- **Security & Multi-tenancy**: Advanced RBAC with super admin capabilities, multi-organization support, audit logging
- **Real-time Status Sync**: Robust service communication with exponential backoff retry logic and IPv6/IPv4 network support
- **System Logs Management**: Real-time container log access with advanced filtering and raw log viewing
- **Monitoring & Observability**: Prometheus, Grafana, Loki, cAdvisor with integrated access and real-time alerting
- **Enterprise Architecture**: Docker containerization, microservices architecture with service mesh communication
- **Settings & Organization Management**: Integrated global organization context with automatic header injection
- **User Management**: Comprehensive user administration with role-based permissions and organization access control

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
   # For existing deployments - add system settings permission to admin users
   docker exec -i maes-postgres psql -U maes_user -d maes_db < database/migrations/add_system_settings_permission.sql
   
   # If you have other pending migrations
   docker exec -i maes-postgres psql -U maes_user -d maes_db < database/migrations/update_user_roles_fixed.sql
   ```

2. **Access the application**:
   - **Web Interface**: https://localhost (dev) or https://yourdomain.com (prod)
   - **API Documentation**: https://localhost/api/docs (proxied via nginx)
   - **Default Login**: admin@maes.local / admin123
   - **Monitoring**: Direct access from dashboard or https://localhost/grafana/ (admin / admin) - [📊 Monitoring Guide](docs/MONITORING.md)

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

## 🏗️ High-Level Architecture

MAES follows a modern microservices architecture with specialized services for different aspects of Microsoft 365 security analysis.

**Note**: The compliance controls (CIS v4.0.0) are automatically loaded during initial deployment via database migrations.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MAES Platform Overview                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────┐
                    │         Microsoft 365 Cloud            │
                    │  ┌─────────────┐ ┌─────────────┐        │
                    │  │Exchange     │ │Graph API    │        │
                    │  │Online       │ │(Users, MFA, │        │
                    │  │(UAL Logs)   │ │ Compliance) │        │
                    │  └─────────────┘ └─────────────┘        │
                    └─────────────────────────────────────────┘
                                     │
                              Certificate Authentication
                                     │
            ┌─────────────────────────────────────────────────────────────────────────────────────┐
            │                           MAES Platform                                             │
            │                                                                                     │
            │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
            │  │  React Frontend │  │  Node.js API    │  │  Compliance     │  │  Data Analytics ││
            │  │                 │  │                 │  │  Service        │  │                 ││
            │  │ • Multi-tab UI  │  │ • REST/GraphQL  │  │ • CIS Benchmarks│  │ • MITRE Mapping ││
            │  │ • Real-time     │  │ • WebSocket     │  │ • Assessment    │  │ • Pattern Match ││
            │  │ • Compliance    │  │ • Authentication│  │ • Reporting     │  │ • Threat Hunt   ││
            │  │   Reports       │  │ • Multi-tenant  │  │ • Remediation   │  │ • Analysis      ││
            │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘│
            │           │                   │                   │                   │             │
            │           └───────────────────┼───────────────────┼───────────────────┘             │
            │                               │                   │                                 │
            │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
            │  │  Extractor      │  │  Queue System   │  │  TimescaleDB    │  │  Monitoring     ││
            │  │  Service        │  │                 │  │                 │  │  Stack          ││
            │  │                 │  │ • BullMQ/Redis  │  │ • Time-series   │  │                 ││
            │  │ • PowerShell    │  │ • Job Priority  │  │ • Audit Logs    │  │ • Prometheus    ││
            │  │ • M365 APIs     │  │ • Retry Logic   │  │ • Analysis Data │  │ • Grafana       ││
            │  │ • Progress      │  │ • Health Checks │  │ • User Sessions │  │ • Alerting      ││
            │  │   Tracking      │  │                 │  │ • Compliance    │  │ • Log Aggreg   ││
            │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘│
            └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Components

1. **Frontend Layer**: React-based dashboard with Material-UI, real-time updates, and comprehensive compliance reporting
2. **API Gateway**: Node.js/Express with JWT authentication, RBAC, and multi-tenant support
3. **Microservices**:
   - **Compliance Service**: CIS benchmark assessments with certificate-based Graph API integration
   - **Extractor Service**: PowerShell-based M365 data extraction with progress monitoring  
   - **Analytics Service**: Multi-threaded analysis engine with MITRE ATT&CK mapping
4. **Data Layer**: TimescaleDB for time-series data, Redis for job queues and caching
5. **Infrastructure**: Docker containers with Nginx reverse proxy, SSL termination, and monitoring stack

For detailed architecture diagrams and service specifications, see [ARCHITECTURE.md](ARCHITECTURE.md).

## 📊 Using MAES

### Compliance Assessment
1. **Register an Organization**: Set up Azure AD app registration with certificate authentication
2. **Configure Credentials**: Add tenant ID, client ID, and upload X.509 certificate
3. **Run Compliance Assessment**: Execute CIS Microsoft 365 v4.0.0 benchmark evaluation
4. **Review Results**: Comprehensive reports showing:
   - **Tenant Overview**: Technical characteristics, user/group analysis, application inventory
   - **Failing entities**: Specific users/groups/policies that fail compliance checks
   - **Remediation Guidance**: Actionable steps to address compliance gaps
   - **Executive Reports**: HTML reports with detailed findings and risk assessments

### M365 Data Extraction
1. **Configure API Permissions**:

   | Permission | Description |
   |------------|-------------|
   | `Application.Read.All` | Read all applications |
   | `AuditLog.Read.All` | Read all audit log data |
   | `AuditLogsQuery.Read.All` | Read audit logs data from all services |
   | `Directory.Read.All` | Read directory data |
   | `IdentityRiskEvent.Read.All` | Read all identity risk event information |
   | `IdentityRiskyUser.Read.All` | Read all identity risky user information |
   | `Mail.ReadBasic.All` | Read metadata of mail in all mailboxes |
   | `Policy.Read.All` | Read your organization's policies |
   | `UserAuthenticationMethod.Read.All` | Read all users authentication methods |
   | `Policy.Read.All` | Read the conditional access policies |
   | `User.Read.All` | Read all users full profiles |
   | `Group.Read.All` | Allows the app to list groups |
   | `Device.Read.All` | Read all device information |
   | `Mail.ReadWrite` (optional) | Read the content of emails in all mailboxes. This method requires write permissions. Alternatively, emails can be acquired by other means. |

2. **Grant Required Permissions**: 
   - **Compliance Administrator** role is required for UAL (Unified Audit Log) extraction
   - The user or service principal must be assigned this role in Microsoft 365
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

## 🔄 Recent Platform Enhancements

### Enterprise RBAC & Multi-Organization Support
- **Super Admin Capabilities**: Enhanced admin users with super admin privileges for complete platform management
- **Multi-Organization Permissions**: Granular cross-tenant access control (e.g., viewer role across multiple organizations)
- **Modular Permission System**: Comprehensive permission sets including API access, organization creation, system management
- **Self-Permission Management**: Fixed restriction preventing super admins from editing their own permissions
- **Organization Offboarding**: Complete data cleanup system with configurable grace periods and restoration capabilities

### Data Lifecycle Management
- **Automated Data Cleanup**: Scheduled background jobs for organization data removal after configurable periods (default: 7 days)
- **Cross-Service Data Wipe**: Comprehensive cleanup across Extractor, Analyzer, Redis, and PostgreSQL services
- **Organization-Scoped Storage**: Enhanced file storage architecture with proper organization isolation
- **Grace Period Management**: Soft delete with restoration capabilities before permanent data removal

### Service Communication & Status Synchronization
- **Fixed Extractor Status Sync**: Resolved critical issue where completed extractions remained stuck in "pending" status
- **IPv6/IPv4 Network Support**: Enhanced container networking with proper IPv6-mapped IPv4 address handling
- **Exponential Backoff Retry**: Implemented robust retry logic (3 attempts, 2-second delays) for failed API communications
- **Service Token Security**: Strengthened internal service authentication with timing-safe token validation
- **Service-to-Service APIs**: Added cleanup endpoints in Extractor and Analyzer services for data management

### System Logs Infrastructure  
- **Real-time Container Logs**: New SystemLogs page with live access to all container logs
- **Advanced Log Filtering**: Search by container, log level, time range, and content with pagination
- **Raw Log Viewing**: Complete unprocessed log data with JSON parsing and metadata display
- **Secure Access Control**: Requires `canManageSystemSettings` permission for administrative log access

### Database Enhancements
- **Extended Extraction Types**: Added support for 'ual_graph' and 'licenses' extraction types
- **Improved Data Integrity**: Fixed PostgreSQL enum validation errors for new extraction types
- **Status Synchronization**: Real-time database updates reflecting extraction job completion states
- **Migration System**: Complete database migration support for fresh deployments and upgrades
- **Organization Schema**: Enhanced organization table with offboarding columns and indexing

### Architecture Improvements
- **Microservices Communication**: Enhanced service-to-service API communication with robust error handling
- **Container Orchestration**: Improved Docker networking and service discovery
- **Performance Optimization**: Efficient log pagination and caching for large data volumes
- **Express Dependencies**: Added Express.js support to Analyzer and Extractor services for cleanup APIs

### API & Frontend Integration Improvements
- **Organization Context Management**: Implemented global organization store with automatic header injection via axios interceptors
- **Authentication Flow**: Fixed JWT-based organization context validation across all API endpoints
- **Graph API Compatibility**: Enhanced pagination handling for Microsoft Graph API endpoints with endpoint-specific requirements
- **Compliance Controls**: Automated CIS v4.0.0 controls loading via database migrations for fresh deployments
- **Service Communication**: Fixed extraction-to-analysis service communication with proper authentication headers
- **Certificate Authentication**: Added support for both 'clientId' and 'applicationId' field names for backward compatibility

### Compliance Report Generation & Download
- **Report Path Resolution**: Fixed path mismatch between report generation (`/app/src/reports/`) and download endpoint (`/app/reports/`)
- **Multiple Report Formats**: Support for HTML, JSON, CSV, and PDF report generation with proper content-type headers
- **Report Storage**: Centralized report storage in compliance service with database metadata tracking
- **Download Endpoint**: Secure report download with proper file validation and content disposition headers

### Settings & Organization Management Improvements  
- **Global Organization Context**: Integrated global OrganizationContext throughout Settings page tabs
- **Test Connection Fix**: Added missing authenticateToken middleware to test-connection endpoint
- **Organization Removal**: Added visible "Remove Organization" button with proper permission checks
- **Tab Synchronization**: Fixed Settings tabs (General, Credentials, Extraction, Analysis) to properly sync with selected organization
- **Field Mapping**: Corrected tenant_id field mapping between backend (snake_case) and frontend (camelCase)

### User Management Improvements
- **Model Methods**: Fixed User.findById implementation replacing incorrect User.findOne usage
- **Permission Endpoints**: Added PATCH `/api/users/:id/permissions` endpoint for updating user permissions
- **Error Handling**: Improved error responses with proper status codes (400, 404, 500)
- **Super Admin Role**: Enhanced admin users with super_admin role for complete platform management
- **Organization Access**: Fixed organization access validation for user operations

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

### UAL (Unified Audit Log) Extraction Issues
- **Error**: "The role assigned to application isn't supported"
- **Solution**: Assign **Compliance Administrator** role to the user or service principal
- **Steps**:
  1. Go to Microsoft 365 Admin Center
  2. Navigate to **Roles** > **Role assignments**
  3. Select **Compliance Administrator**
  4. Add the user or service principal to this role
- **Alternative**: Use Global Administrator role (not recommended for production)

### Extraction Status Issues
- **Issue**: Extractions stuck in "pending" status despite completion
- **Solution**: Status synchronization has been enhanced with retry logic
- **Check**: Monitor SystemLogs page for service communication errors
- **Debug**: Verify service token authentication between containers

### Analysis Not Showing Progress
- Check that analysis jobs are created in database
- Verify analyzer service is processing jobs
- Check WebSocket connection in browser dev tools

### System Logs Access
- **Permission Required**: `canManageSystemSettings` role permission
- **Access Path**: Dashboard → System Logs or direct navigation
- **Features**: Container filtering, log level filtering, raw log viewing

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

### Settings Page Issues
- **Issue**: Settings tabs not updating when switching organizations
- **Solution**: Integration of global OrganizationContext instead of local state management
- **Debug**: Check browser console for organization context errors
- **Fix Applied**: Settings.jsx now uses global useOrganization hook for consistent state

### User Management Issues  
- **Error**: "User.findOne is not a function" (500 error)
- **Solution**: Use User.findById which is the correct model method
- **Error**: "Cannot PATCH /api/users/:id/permissions" (404 error)
- **Solution**: Permission update endpoint has been added to users router

### Compliance Report Download Issues
- **Error**: "Report file not found" when downloading compliance reports
- **Solution**: Report path has been fixed to match where reportGenerator.js saves files
- **Debug**: Check compliance service logs for file path details
- **Location**: Reports are saved in `/app/src/reports/` within the compliance container

## 📋 Backup & Maintenance

### Database Backup
```bash
# Backup PostgreSQL database
docker exec maes-postgres pg_dump -U maes_user maes_db > backup.sql

# Restore database
docker exec -i maes-postgres psql -U maes_user maes_db < backup.sql
```

## 📊 Monitoring & Observability

MAES includes a comprehensive monitoring stack with Prometheus, Grafana, Loki, and cAdvisor for real-time metrics, logs, and system monitoring.

### 🔍 Monitoring Services

All monitoring services are accessible through nginx reverse proxy at:

| Service | URL | Default Credentials | Purpose |
|---------|-----|-------------------|---------|
| **Grafana** | https://localhost/grafana/ | admin / admin | Dashboards & visualization |
| **Prometheus** | https://localhost/prometheus/ | No auth | Metrics collection |
| **Loki** | https://localhost/loki/ | No auth | Log aggregation |
| **cAdvisor** | https://localhost/cadvisor/ | No auth | Container metrics |

### 🎯 Quick Access

Access monitoring directly from the MAES platform:
- **Header Toolbar**: Quick access buttons to Grafana, Prometheus, Loki, and cAdvisor
- **Sidebar Navigation**: Dedicated monitoring services section with detailed descriptions  
- **Dashboard Widgets**: Live container logs and system metrics integrated into the main dashboard

### 🚨 Real-time Alerts

The MAES platform includes a comprehensive real-time alerts system:

**Alert Features**:
- **Severity Levels**: Critical, High, Medium, Low with color-coded indicators
- **Real-time Badge**: Header icon showing unread alert count
- **Interactive Popover**: Detailed alert list with management actions
- **Alert Management**: Mark as read, dismiss, and bulk operations
- **Auto-refresh**: Alerts update automatically across all dashboard components

**Accessing Alerts**:
- Click the warning icon in the header to view all alerts
- Alerts integrate with the monitoring stack for comprehensive system oversight
- Alert history and management available through the dedicated alerts interface

### 📈 Available Dashboards

**MAES Platform Overview** (Pre-configured):
- Service CPU usage (API, Extractor, Analyzer)
- Job statistics (Total extractions, analyses, alerts)
- HTTP request rates and response times
- Queue lengths for extraction and analysis jobs
- System resource utilization

### 🔧 Default Credentials

**Important**: Change default passwords in production!

#### Grafana
- **Username**: `admin`
- **Password**: `admin`
- **Environment Variables**:
  ```bash
  GRAFANA_USER=your_username      # Default: admin
  GRAFANA_PASSWORD=your_password  # Default: admin
  ```

#### Other Services
- **Prometheus**: No authentication (internal use)
- **Loki**: No authentication (internal use)
- **cAdvisor**: No authentication (internal use)

### 🔒 Security Configuration

For production deployments, secure your monitoring stack:

```bash
# Add to your .env file
GRAFANA_USER=secure_admin_username
GRAFANA_PASSWORD=secure_random_password_here
```

### 📊 Available Metrics

**System Metrics**:
- CPU, Memory, Disk, Network usage
- Container resource consumption
- Docker container statistics

**Application Metrics**:
- HTTP request rates and latencies
- Job queue lengths and processing times
- Database connection pools
- Redis connection statistics
- Custom MAES business metrics

**Log Aggregation**:
- Structured logs from all services
- Real-time log streaming
- Searchable log history
- Error tracking and alerting

### 🛠️ Advanced Monitoring Setup

#### Custom Metrics
Add custom metrics to your services by using the Prometheus client:
```javascript
// In API service - already implemented
const { metrics } = require('./utils/metrics');
metrics.extractionJobsTotal.inc({ type: 'ual', status: 'completed' });
```

#### Custom Dashboards
1. Access Grafana at https://localhost/grafana/
2. Login with admin credentials
3. Create new dashboard or modify existing ones
4. Dashboards are automatically provisioned from `/monitoring/grafana/dashboards/`

#### Log Queries
Use Loki to query logs:
```logql
{container="maes-api"} |= "error"
{container=~"maes-.*"} | json | level="error"
```

### 🔍 Health Monitoring

```bash
# Check all services status
docker compose ps

# View service logs
docker compose logs -f <service-name>

# Monitor resource usage
docker stats

# Check specific monitoring services
docker compose logs grafana
docker compose logs prometheus
docker compose logs loki
```

### 🚨 Alerting (Optional)

To set up alerting, configure Alertmanager:
1. Add alertmanager service to docker-compose.yml
2. Configure alert rules in Prometheus
3. Set up notification channels (email, Slack, etc.)

Example alert rule for high error rates:
```yaml
groups:
  - name: maes_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate detected"
```

### Cleanup
```bash
# Clean up old containers and images
docker system prune -f

# Remove volumes (WARNING: This deletes all data)
docker compose down -v
```

## 🔄 Migration Instructions

### For Existing Deployments

If you're upgrading from a previous version, apply these migrations:

```bash
# 1. Update user roles to super_admin (if needed)
docker exec -i maes-postgres psql -U maes_user -d maes_db << 'EOF'
UPDATE maes.users 
SET role = 'super_admin' 
WHERE email = 'admin@maes.local';
EOF

# 2. Verify compliance report paths
docker exec maes-compliance ls -la /app/src/reports/

# 3. Clear browser cache and cookies
# This ensures the new organization context is properly initialized

# 4. Restart services to apply all fixes
docker-compose restart api frontend compliance
```

### Verification Steps

1. **Test Organization Context**:
   - Login and switch between organizations
   - Verify Settings tabs update with correct organization data

2. **Test User Management**:
   - Create, update, and manage users
   - Verify permission updates work correctly

3. **Test Compliance Reports**:
   - Generate a new compliance report
   - Download the report to verify path resolution

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**MAES Platform** - Microsoft 365 Forensic Analysis Made Simple