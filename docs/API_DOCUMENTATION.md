# MAES API Documentation

> **Developed by [IONSEC.IO Dev Team](https://github.com/ionsec/maes-platform)** - Specializing in Incident Response Services and Cybersecurity Solutions

## Overview

The MAES API provides comprehensive endpoints for Microsoft 365 forensic analysis, data extraction, and security event management. The API is RESTful and uses JWT authentication.

**Base URL**: `http://localhost:3000/api`
**API Documentation**: `http://localhost:3000/api/docs`

## Authentication

All API endpoints (except `/auth/login`) require JWT authentication via Bearer token.

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/analysis
```

## Endpoints

### Authentication

#### POST `/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "admin@maes.local",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin@maes.local",
    "email": "admin@maes.local",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "permissions": ["canRunAnalysis", "canViewReports"],
    "organization": {
      "id": "uuid",
      "name": "Your Organization",
      "tenantId": "tenant-id",
      "isActive": true
    }
  }
}
```

### Data Extraction

#### GET `/extractions`
Get list of data extractions with pagination.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `status` (optional): Filter by status
- `type` (optional): Filter by extraction type

**Response:**
```json
{
  "success": true,
  "extractions": [
    {
      "id": "uuid",
      "type": "unified_audit_log",
      "status": "completed",
      "startDate": "2024-01-01",
      "endDate": "2024-01-31",
      "itemsExtracted": 15000,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "pages": 3,
    "limit": 20
  }
}
```

#### POST `/extractions`
Start a new data extraction.

**Request Body:**
```json
{
  "type": "unified_audit_log",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "parameters": {
    "includeMailboxAudit": true,
    "includeMessageTrace": false
  }
}
```

### Analysis

#### GET `/analysis`
Get analysis jobs with pagination and filtering.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by status
- `type` (optional): Filter by analysis type

**Response:**
```json
{
  "success": true,
  "analysisJobs": [
    {
      "id": "uuid",
      "type": "ual_analysis",
      "status": "completed",
      "priority": "high",
      "extractionId": "uuid",
      "parameters": {},
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "pages": 2,
    "limit": 20
  }
}
```

#### POST `/analysis`
Create a new analysis job.

**Request Body:**
```json
{
  "extractionId": "uuid",
  "type": "ual_analysis",
  "priority": "high",
  "parameters": {
    "detectSuspiciousActivity": true,
    "includeMITREMapping": true
  }
}
```

### Alerts

#### GET `/alerts`
Get security alerts with pagination and filtering.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `severity` (optional): Filter by severity
- `category` (optional): Filter by category
- `status` (optional): Filter by status

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "id": "uuid",
      "title": "Suspicious Login Detected",
      "description": "Multiple failed login attempts detected",
      "severity": "high",
      "category": "authentication",
      "status": "new",
      "mitreTechniques": ["T1078", "T1110"],
      "affectedEntities": {
        "users": ["user@domain.com"],
        "ips": ["192.168.1.100"]
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pages": 5,
    "limit": 20
  }
}
```

### Reports

#### GET `/reports`
Get generated reports with pagination.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `type` (optional): Filter by report type
- `status` (optional): Filter by status

#### POST `/reports`
Create a new report.

**Request Body:**
```json
{
  "name": "Monthly Security Report",
  "type": "executive_summary",
  "format": "pdf",
  "parameters": {
    "includeCharts": true,
    "includeRecommendations": true
  }
}
```

#### GET `/reports/{id}/download`
Download a completed report.

## SIEM Integration

### Export Events

#### GET `/siem/events`
Export security events in various SIEM formats.

**Query Parameters:**
- `format` (required): SIEM format (`splunk`, `qradar`, `elasticsearch`, `cef`, `json`)
- `startDate` (optional): Start date for events
- `endDate` (optional): End date for events
- `eventTypes` (optional): Comma-separated list of event types
- `severity` (optional): Filter by severity

**Example - Splunk Format:**
```bash
curl -X GET "http://localhost:3000/api/siem/events?format=splunk" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (Splunk):**
```json
{
  "success": true,
  "format": "splunk",
  "totalEvents": 150,
  "events": [
    {
      "_time": "2024-01-15T10:30:00Z",
      "_raw": "{\"id\":\"uuid\",\"title\":\"Suspicious Login\"}",
      "sourcetype": "maes:security:events",
      "source": "maes-platform",
      "host": "maes-server",
      "index": "security",
      "event": {
        "id": "uuid",
        "title": "Suspicious Login",
        "severity": "high",
        "category": "authentication"
      }
    }
  ]
}
```

### Download Events

#### GET `/siem/download`
Download security events in various file formats.

**Query Parameters:**
- `format` (required): Download format (`csv`, `json`, `xml`, `cef`)
- `startDate` (optional): Start date for events
- `endDate` (optional): End date for events

**Example - CSV Download:**
```bash
curl -X GET "http://localhost:3000/api/siem/download?format=csv" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output security-events.csv
```

## SIEM Format Details

### Splunk Format
Events are formatted for Splunk with proper timestamp and source type mapping.

### QRadar Format
Events include QID mapping and magnitude calculations for QRadar integration.

### Elasticsearch Format
Events are formatted with proper `@timestamp` and field mappings for Elasticsearch.

### CEF Format
Common Event Format (CEF) for universal SIEM compatibility.

**CEF Example:**
```
CEF:0|IONSEC.IO|MAES Platform|1.0.0|AUTH-001|Suspicious Login|6|msg=Multiple failed login attempts suser=unknown duser=unknown
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": [
    {
      "field": "username",
      "message": "Username is required"
    }
  ]
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- Authentication endpoints: 5 requests per minute
- General API endpoints: 100 requests per minute
- SIEM export endpoints: 50 requests per minute

## Permissions

The API uses role-based access control:

- **Admin**: Full access to all endpoints
- **Analyst**: Can run analysis, view reports, export data
- **Viewer**: Read-only access to data and reports

## Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access API documentation
open http://localhost:3000/api/docs
```

### Testing
```bash
# Run API tests
npm test

# Run with coverage
npm run test:coverage
```

## Support

For technical support and incident response services:
- **Email**: contact@ionsec.io
- **GitHub**: https://github.com/ionsec/maes-platform
- **Documentation**: http://localhost:3000/api/docs

---

**Developed by [IONSEC.IO Dev Team](https://github.com/ionsec/maes-platform)** - Specializing in Incident Response Services and Cybersecurity Solutions 