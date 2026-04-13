# MAES API Documentation

> **Developed by [IONSEC.IO Dev Team](https://github.com/ionsec/maes-platform)** — Specializing in Incident Response Services and Cybersecurity Solutions

## Overview

The MAES API provides comprehensive endpoints for Microsoft 365 forensic analysis, data extraction, security event management, user behavior analytics, incident response, and threat intelligence enrichment. The API is RESTful and uses JWT authentication.

**Base URL**: `http://localhost:3000/api`  
**Interactive Docs**: `http://localhost:3000/api/docs`

## Authentication

All API endpoints (except `/auth/login`) require JWT authentication via Bearer token.

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/analysis
```

## Endpoints

### Authentication

#### POST `/auth/login`
Authenticate user and receive a JWT token.

**Request Body:**
```json
{
  "username": "admin@example.com",
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
    "username": "admin@example.com",
    "email": "admin@example.com",
    "role": "admin",
    "permissions": { "canRunAnalysis": true, "canViewReports": true },
    "organization": { "id": "uuid", "name": "Your Organization" }
  }
}
```

---

### Data Extraction

#### GET `/extractions`
List data extractions with pagination.

**Query Parameters:** `page`, `limit`, `status`, `type`

#### POST `/extractions`
Start a new data extraction.

**Request Body:**
```json
{
  "type": "unified_audit_log",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "parameters": { "includeMailboxAudit": true }
}
```

---

### Analysis

#### GET `/analysis`
List analysis jobs with pagination.

**Query Parameters:** `page`, `limit`, `status`, `type`

#### POST `/analysis`
Create a new analysis job.

**Request Body:**
```json
{
  "extractionId": "uuid",
  "type": "ual_analysis",
  "priority": "high"
}
```

---

### Alerts

#### GET `/alerts`
List security alerts with filtering.

**Query Parameters:** `page`, `limit`, `severity`, `category`, `status`

**Response:**
```json
{
  "success": true,
  "alerts": [
    {
      "id": "uuid",
      "title": "Suspicious Login Detected",
      "severity": "high",
      "category": "authentication",
      "status": "new",
      "mitreTechniques": ["T1078", "T1110"],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": { "total": 100, "page": 1, "pages": 5, "limit": 20 }
}
```

---

### UEBA (User Entity Behavior Analytics)

#### GET `/ueba/baseline/:userId`
Get or create a behavior baseline for a user.

**Response:**
```json
{
  "success": true,
  "baseline": {
    "id": "uuid",
    "user_id": "uuid",
    "baseline_data": {
      "login_frequency": 12.5,
      "unique_ips": 3,
      "primary_country": "US",
      "peak_activity_hour": 10,
      "confidence_level": 70,
      "risk_score": 15
    }
  }
}
```

#### GET `/ueba/risk/:userId`
Get a user's current risk score.

**Response:**
```json
{
  "success": true,
  "riskScore": {
    "risk_score": 35,
    "confidence": 70,
    "primary_country": "US",
    "unique_ips": 3,
    "unique_countries": 1
  }
}
```

#### GET `/ueba/baselines`
List all user baselines for the organization.

**Query Parameters:** `page`, `limit`

#### POST `/ueba/process-activity`
Process an activity event and check for anomalies.

**Request Body:**
```json
{
  "userId": "uuid",
  "activity": {
    "country": "CN",
    "timestamp": "2024-01-15T03:00:00Z",
    "operation": "Reset user password"
  }
}
```

**Response (anomaly detected):**
```json
{
  "success": true,
  "result": {
    "anomalies": [
      { "type": "geographic_anomaly", "severity": "high", "risk_score": 30 },
      { "type": "temporal_anomaly", "severity": "medium", "risk_score": 20 }
    ],
    "total_risk_score": 50,
    "recommendation": { "action": "require_mfa", "message": "Elevated risk." }
  }
}
```

#### GET `/ueba/stats`
Get UEBA statistics for the organization.

---

### Incident Management

#### GET `/incidents`
List incidents with filtering.

**Query Parameters:** `page`, `limit`, `status`, `severity`

#### GET `/incidents/stats/summary`
Get incident statistics (counts by status and severity, average resolution time).

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": "12",
    "new": "3",
    "investigating": "4",
    "critical": "2",
    "avg_resolution_time_seconds": "86400"
  }
}
```

#### GET `/incidents/meta/playbooks`
List available automated playbooks.

#### GET `/incidents/:id`
Get incident details including timeline and evidence.

#### POST `/incidents`
Create a new incident.

**Request Body:**
```json
{
  "title": "Suspicious admin activity",
  "description": "Unusual privilege escalation detected",
  "severity": "high",
  "alertIds": ["uuid1", "uuid2"]
}
```

#### PUT `/incidents/:id/status`
Update incident status. Valid statuses: `new`, `investigating`, `contained`, `resolved`, `closed`.

**Request Body:**
```json
{ "status": "investigating", "notes": "Starting investigation" }
```

#### PUT `/incidents/:id/assign`
Assign incident to a user.

**Request Body:**
```json
{ "assignedTo": "user-uuid" }
```

#### POST `/incidents/:id/evidence`
Add evidence to an incident.

**Request Body:**
```json
{
  "type": "log",
  "name": "audit_log_export.csv",
  "description": "Exported audit logs for the incident period",
  "hash": "sha256:abc123..."
}
```

#### POST `/incidents/:id/playbook`
Execute a playbook on an incident.

**Request Body:**
```json
{ "playbookId": "compromised-account" }
```

---

### Threat Intelligence

#### GET `/threat-intel/enrich/ip/:ip`
Enrich an IP address using configured providers.

**Response:**
```json
{
  "success": true,
  "data": {
    "ip": "1.2.3.4",
    "type": "ip",
    "risk_score": 45,
    "risk_level": "high",
    "providers_checked": ["abuseipdb", "shodan"],
    "findings": [
      { "provider": "abuseipdb", "type": "reputation", "severity": "high", "data": {} }
    ],
    "metadata": { "abuseReports": 120 }
  }
}
```

#### GET `/threat-intel/enrich/domain/:domain`
Enrich a domain.

#### GET `/threat-intel/enrich/hash/:hash`
Enrich a file hash (MD5, SHA1, SHA256).  
**Query Parameter:** `type` (default: `sha256`)

#### POST `/threat-intel/enrich/bulk`
Bulk enrich multiple IOCs (1–100).

**Request Body:**
```json
{
  "iocs": [
    { "value": "1.2.3.4", "type": "ip" },
    { "value": "evil.com", "type": "domain" },
    { "value": "abc123...", "type": "hash" }
  ]
}
```

#### GET `/threat-intel/stats`
Get threat intelligence provider status and cache size.

#### GET `/threat-intel/saved`
List saved IOCs for the organization.

**Query Parameters:** `page`, `limit`, `type`, `risk_level`

#### POST `/threat-intel/saved`
Save an IOC for tracking.

**Request Body:**
```json
{ "value": "1.2.3.4", "type": "ip", "notes": "Flagged in phishing campaign" }
```

#### DELETE `/threat-intel/saved/:id`
Remove a saved IOC.

---

### Reports

#### GET `/reports`
List generated reports with pagination.

#### POST `/reports`
Create a new report.

#### GET `/reports/{id}/download`
Download a completed report.

---

### SIEM Integration

#### GET `/siem/events`
Export security events in SIEM formats (`splunk`, `qradar`, `elasticsearch`, `cef`, `json`).

**Query Parameters:** `format`, `startDate`, `endDate`, `eventTypes`, `severity`

#### GET `/siem/download`
Download events as file (`csv`, `json`, `xml`, `cef`).

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": [{ "field": "username", "message": "Username is required" }]
}
```

## Rate Limiting

- Authentication endpoints: 5 requests per minute
- General API endpoints: 100 requests per minute
- SIEM export endpoints: 50 requests per minute

## Permissions (RBAC)

| Permission | super_admin | admin | analyst | viewer |
|---|---|---|---|---|
| canManageExtractions | ✅ | ✅ | ✅ | ❌ |
| canRunAnalysis | ✅ | ✅ | ✅ | ❌ |
| canViewReports | ✅ | ✅ | ✅ | ✅ |
| canManageAlerts | ✅ | ✅ | ✅ | ❌ |
| canManageIncidents | ✅ | ✅ | ✅ | ❌ |
| canAccessThreatIntel | ✅ | ✅ | ✅ | ❌ |
| canManageCompliance | ✅ | ✅ | ✅ | ❌ |
| canManageUsers | ✅ | ✅ | ❌ | ❌ |
| canManageSystemSettings | ✅ | ❌ | ❌ | ❌ |

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access interactive API docs
open http://localhost:3000/api/docs
```

## Support

- **Email**: dev@ionsec.io
- **GitHub**: https://github.com/ionsec/maes-platform
- **API Docs**: http://localhost:3000/api/docs

---

**Developed by [IONSEC.IO Dev Team](https://github.com/ionsec/maes-platform)** — Specializing in Incident Response Services and Cybersecurity Solutions
