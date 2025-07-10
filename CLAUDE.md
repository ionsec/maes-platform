# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MAES (M365 Analyzer & Extractor Suite)** is a comprehensive forensic analysis platform that combines Microsoft-Analyzer-Suite and Microsoft-Extractor-Suite into a unified SaaS solution for Microsoft 365 data extraction and analysis. The platform uses a microservices architecture with Docker containerization.

## Architecture

The system consists of 5 main services:

1. **API Gateway** (`/api/`) - Node.js/Express REST API server with authentication, rate limiting, and job orchestration
2. **Frontend** (`/frontend/`) - React application with Material-UI components
3. **Extractor Service** (`/services/extractor/`) - PowerShell-based data extraction from M365/Azure AD
4. **Analyzer Service** (`/services/analyzer/`) - Advanced analytics and threat detection engine
5. **Database & Infrastructure** - PostgreSQL (TimescaleDB), Redis, Elasticsearch

### Key Data Flow
- Frontend → API Gateway → Job Queue (Redis) → Extractor Service → Database
- Extracted data → Analyzer Service → Alerts/Reports → Frontend

## Common Commands

### Docker Development
```bash
# Build and start all services
docker-compose up -d

# Rebuild specific service
docker-compose build --no-cache <service>

# View logs
docker-compose logs -f <service>

# Clean all volumes and containers
docker-compose down -v
docker system prune -f
```

### API Development
```bash
cd api
npm install
npm run dev          # Development with nodemon
npm run lint         # ESLint
npm test            # Jest tests
npm run migrate     # Database migrations
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev         # Vite development server
npm run build       # Production build
npm run lint        # ESLint
```

### Service Development
```bash
# Extractor service
cd services/extractor
npm install
npm run dev

# Analyzer service
cd services/analyzer
npm install
npm run dev
```

## Database Schema

The system uses PostgreSQL with TimescaleDB extensions in the `maes` schema:

- **organizations** - Multi-tenant organization data with credentials
- **users** - User authentication and RBAC
- **extractions** - Data extraction jobs and status
- **analysis_jobs** - Analysis tasks and results
- **alerts** - Security alerts and incidents
- **reports** - Generated reports and exports

Key enum types:
- `user_role`: admin, analyst, viewer
- `extraction_type`: unified_audit_log, azure_signin_logs, azure_audit_logs, etc.
- `job_status`: pending, running, completed, failed, cancelled

## Authentication & Authorization

- JWT-based authentication with role-based access control
- Service-to-service authentication using `SERVICE_AUTH_TOKEN`
- Multi-tenant isolation by `organization_id`
- Password hashing with bcrypt

## PowerShell Integration

The extractor service uses PowerShell modules:
- **Microsoft-Extractor-Suite** - Core extraction functionality
- **Az** - Azure PowerShell module
- **Microsoft.Graph** - Microsoft Graph API access
- **ExchangeOnlineManagement** - Exchange Online access

### Authentication Methods
- Certificate-based (PFX files with passwords)
- Certificate thumbprint
- Client secret credentials

## API Structure

### Core Endpoints
- `/api/auth/*` - Authentication and user management
- `/api/organizations/*` - Organization setup and connection testing
- `/api/extractions/*` - Data extraction management
- `/api/analysis/*` - Analysis job management
- `/api/alerts/*` - Alert management
- `/api/reports/*` - Report generation
- `/api/upload/*` - File upload for pre-extracted data
- `/api/siem/*` - SIEM integration and export

### Job Queue Architecture
- Uses Bull/Redis for job queuing
- Extraction jobs: `extract-data` queue
- Analysis jobs: `analysis-jobs` queue
- Connection testing: `test-connection` queue

## Testing

### Token Errors
Common issue: JWT token expiration during extraction/analysis operations
- Check token validity in requests
- Verify authentication middleware is working
- Test with fresh tokens from `/api/auth/login`

### Database Debugging
```bash
# Connect to database
docker-compose exec postgres psql -U maes_user -d maes_db

# Check analysis jobs
SELECT * FROM maes.analysis_jobs WHERE organization_id = 'your-org-id';

# Check extractions
SELECT * FROM maes.extractions WHERE status = 'running';
```

## Real-time Features

- **WebSocket Integration** - Socket.io for real-time updates
- **Progress Monitoring** - LogFile.txt parsing for extraction progress
- **UAL Status Tracking** - Unified Audit Log availability monitoring

## Security Considerations

- Certificate management in `/certs` directory
- Secure credential storage in database JSONB fields
- Rate limiting on all API endpoints
- Input validation with express-validator
- CORS configuration for frontend access

## Environment Variables

Key environment variables (see docker-compose.yml):
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `SERVICE_AUTH_TOKEN` - Internal service authentication
- `ENCRYPTION_KEY` - Data encryption key

## Common Issues

1. **PowerShell Module Loading** - Ensure all modules are properly imported in extraction commands
2. **Certificate Authentication** - Verify PFX files are accessible and passwords are correct
3. **Organization Isolation** - Always filter by `organization_id` in database queries
4. **Job Queue Failures** - Check Redis connectivity and job processing logs
5. **Real-time Updates** - Ensure WebSocket connections are properly established

## Swagger Documentation

API documentation is available at `/api/docs` when the API service is running. All routes include comprehensive JSDoc comments with parameter validation and response schemas.