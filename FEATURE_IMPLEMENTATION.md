# MAES Platform - New Features Implementation

## Overview

This document describes the new security features implemented in the MAES platform, focusing on advanced threat detection, incident response, and security automation.

---

## 1. UEBA (User Entity Behavior Analytics)

### Location
- **Service**: `api/src/services/ueba/`
- **Routes**: `api/src/routes/ueba.js`
- **Database**: Migration `006_add_ueba_incidents_playbooks.sql`

### Features

#### Behavioral Baselines
- Creates user behavior profiles based on 30-day activity history
- Tracks: login frequency, unique IPs, locations, devices, common operations, peak activity hours
- Confidence scoring based on data volume

#### Anomaly Detection
- **Geographic Anomaly**: Detects logins from new countries
- **Temporal Anomaly**: Flags activity at unusual hours
- **Operation Anomaly**: Identifies unusual sensitive operations
- **IP Anomaly**: Detects new IP addresses in different countries

#### Risk Scoring
- Composite risk score (0-100) based on detected anomalies
- Recommendations: allow, monitor, require MFA, block & investigate

### API Endpoints

```
GET    /api/ueba/baseline/:userId     - Get user behavior baseline
GET    /api/ueba/risk/:userId         - Get user risk score
GET    /api/ueba/baselines            - List all baselines
POST   /api/ueba/process-activity     - Process activity for anomalies
GET    /api/ueba/stats                - Get UEBA statistics
```

### Integration

UEBA automatically processes audit logs and creates alerts for high-risk activity (risk score >= 70).

---

## 2. Case Management (Incident Response)

### Location
- **Service**: `api/src/services/caseManagement/`
- **Routes**: `api/src/routes/incidents.js`
- **Database**: Tables `incidents`, `incident_timeline`, `incident_evidence`

### Features

#### Incident Lifecycle
- **Statuses**: new → investigating → contained → resolved → closed
- **Severity**: low, medium, high, critical
- **Assignment**: Incidents can be assigned to specific investigators

#### Timeline Tracking
- Automatic timeline entries for all incident actions
- Status changes, assignments, evidence collection
- User attribution for audit trail

#### Evidence Management
- Chain of custody tracking
- File hash verification
- Secure storage path references
- Metadata preservation

### API Endpoints

```
GET    /api/incidents                  - List incidents
GET    /api/incidents/:id              - Get incident details
POST   /api/incidents                  - Create incident
PUT    /api/incidents/:id/status       - Update status
PUT    /api/incidents/:id/assign       - Assign to user
POST   /api/incidents/:id/evidence     - Add evidence
GET    /api/incidents/stats/summary    - Get statistics
POST   /api/incidents/:id/playbook     - Execute playbook
GET    /api/incidents/meta/playbooks   - List available playbooks
```

### UI Component

**Location**: `frontend/src/pages/Incidents.jsx`

Features:
- Dashboard with stat cards
- Filterable incident list
- Detail view with timeline
- Status management
- Playbook execution

---

## 3. Automated Playbooks

### Location
- **Service**: `api/src/services/playbooks/`
- **Engine**: `playbookEngine.js`

### Built-in Playbooks

#### 1. Compromised Account Response
**Triggers**: brute_force, impossible_travel, suspicious_signin

**Steps**:
1. Gather Intelligence (user details, activities, locations)
2. Assess Impact (privileged access, data access, mailbox rules)
3. Containment (password reset, revoke sessions, require MFA) - *requires approval*
4. Investigation (create incident, assign investigator, collect evidence)
5. Remediation (review rules, check forwarding, app consent)
6. Documentation (generate report, update notes, close)

#### 2. Phishing Email Response
**Triggers**: phishing, malicious_email

**Steps**:
1. Analyze Email (headers, URLs, attachments)
2. Enrich IOCs (VirusTotal checks, sender reputation)
3. Containment (soft delete, block sender/URLs) - *auto-execute*
4. Search Similar (find similar emails, identify affected users)
5. Notification (notify users, send alert)

#### 3. Privileged Access Abuse
**Triggers**: privilege_escalation, unusual_admin_activity

**Steps**:
1. Identify Scope (admin actions, role changes, permission grants)
2. Assess Damage (data access, config changes, new accounts)
3. Containment (disable account, revoke roles, block signin) - *requires approval*
4. Forensics (collect logs, export timeline, preserve evidence)

### Playbook Execution States
- `running` - Currently executing
- `completed` - Successfully finished
- `failed` - Encountered error
- `pending_approval` - Waiting for manual approval
- `error` - System error

### API Integration

```javascript
// Execute playbook on incident
POST /api/incidents/:id/playbook
{
  "playbookId": "compromised-account"
}
```

---

## 4. Threat Intelligence Integration (IOC Enrichment)

### Location
- **Service**: `api/src/services/threatIntel/`
- **Module**: `iocEnrichment.js`

### Supported IOC Types
- **IP Addresses**: Reputation, abuse reports, open ports, vulnerabilities
- **Domains**: Malicious detection, reputation scores
- **File Hashes**: MD5, SHA1, SHA256 malware detection

### Threat Intelligence Providers

| Provider | Type | API Key Env Var |
|----------|------|-----------------|
| VirusTotal | Malware/URL/Domain | `VIRUSTOTAL_API_KEY` |
| AbuseIPDB | IP Reputation | `ABUSEIPDB_API_KEY` |
| Shodan | IP Exposure/Vulns | `SHODAN_API_KEY` |
| IPQualityScore | Fraud/Abuse | `IPQUALITYSCORE_API_KEY` |

### Enrichment Features

#### IP Enrichment
- AbuseIPDB confidence score
- Shodan open ports and services
- Vulnerability detection
- Geographic data

#### Domain Enrichment
- VirusTotal detection ratio
- Historical WHOIS (future)
- DNS records (future)

#### Hash Enrichment
- VirusTotal detection ratio
- Malware family attribution
- First/last seen dates
- Detection names

### Caching
- 1-hour TTL for all enrichments
- In-memory cache with automatic cleanup
- 1000 entry max cache size

### Usage Example

```javascript
const iocEnrichment = require('./services/threatIntel/iocEnrichment');

// Single IOC
const ipResult = await iocEnrichment.enrichIP('1.2.3.4');
const domainResult = await iocEnrichment.enrichDomain('evil.com');
const hashResult = await iocEnrichment.enrichHash('abc123...');

// Bulk enrichment
const bulkResult = await iocEnrichment.bulkEnrich([
  { value: '1.2.3.4', type: 'ip' },
  { value: 'evil.com', type: 'domain' }
]);
```

### Risk Levels
- `critical` (score >= 70)
- `high` (score >= 40)
- `medium` (score >= 20)
- `low` (score > 0)
- `clean` (score = 0)

---

## Database Schema

### New Tables

```sql
-- UEBA Baselines
maes.ueba_baselines
  - id, user_id, organization_id
  - baseline_data (JSONB)
  - is_active, created_at, updated_at

-- Incidents
maes.incidents
  - id, organization_id, title, description
  - severity, status, assigned_to
  - source, metadata
  - created_at, updated_at

-- Incident Timeline
maes.incident_timeline
  - id, incident_id, organization_id
  - event_type, event_data (JSONB)
  - user_id, created_at

-- Incident Evidence
maes.incident_evidence
  - id, incident_id, organization_id
  - type, name, description, hash
  - storage_path, metadata (JSONB)
  - chain_of_custody (JSONB)
  - collected_at, created_at

-- Playbook Executions
maes.playbook_executions
  - id, playbook_id, playbook_name
  - status, current_step, steps (JSONB)
  - context (JSONB), results (JSONB)
  - started_at, completed_at
```

### Modified Tables

```sql
-- Alerts table
ALTER TABLE maes.alerts ADD COLUMN incident_id UUID;
```

---

## Configuration

### Environment Variables

```bash
# Threat Intelligence API Keys
VIRUSTOTAL_API_KEY=your_virustotal_key
ABUSEIPDB_API_KEY=your_abuseipdb_key
SHODAN_API_KEY=your_shodan_key
IPQUALITYSCORE_API_KEY=your_ipqs_key

# Feature Flags (future)
ENABLE_UEBA=true
ENABLE_PLAYBOOKS=true
ENABLE_IOC_ENRICHMENT=true
```

---

## Testing

### Manual Testing

1. **UEBA**:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     https://localhost/api/ueba/baseline/<user-id>
   ```

2. **Incidents**:
   ```bash
   curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","description":"Test incident","severity":"high"}' \
     https://localhost/api/incidents
   ```

3. **Playbooks**:
   ```bash
   curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"playbookId":"compromised-account"}' \
     https://localhost/api/incidents/<id>/playbook
   ```

### Apply Migration

```bash
cd /Users/ruji/maes-platform
docker compose exec postgres psql -U maes_user -d maes_db -f /docker-entrypoint-initdb.d/migrations/006_add_ueba_incidents_playbooks.sql
```

---

## Future Enhancements

### Phase 2 (Next Iteration)
- [ ] Machine Learning anomaly detection models
- [ ] Additional compliance frameworks (NIST CSF, ISO 27001)
- [ ] Webhook integrations (Slack, Teams, PagerDuty)
- [ ] Executive security dashboard
- [ ] Mobile responsive improvements
- [ ] STIX/TAXII threat intel feeds

### Phase 3
- [ ] Advanced forensics module
- [ ] Attack surface management
- [ ] Insider risk management
- [ ] GraphQL API
- [ ] Custom playbook builder UI

---

## Files Modified/Created

### Backend
- `api/src/services/ueba/userBehaviorProfile.js` (NEW)
- `api/src/services/ueba/index.js` (NEW)
- `api/src/services/caseManagement/incidentService.js` (NEW)
- `api/src/services/playbooks/playbookEngine.js` (NEW)
- `api/src/services/threatIntel/iocEnrichment.js` (NEW)
- `api/src/routes/ueba.js` (NEW)
- `api/src/routes/incidents.js` (NEW)
- `api/src/index.js` (MODIFIED)
- `database/migrations/006_add_ueba_incidents_playbooks.sql` (NEW)

### Frontend
- `frontend/src/pages/Incidents.jsx` (NEW)
- `frontend/src/App.jsx` (MODIFIED)
- `frontend/src/components/Sidebar.jsx` (MODIFIED)

---

## Security Considerations

1. **Access Control**: All endpoints require appropriate permissions
2. **Audit Trail**: All incident actions are logged with user attribution
3. **Evidence Integrity**: Hash verification for collected evidence
4. **Data Retention**: Configurable retention policies for baselines and incidents
5. **API Keys**: Threat intel API keys stored in environment variables only

---

## Support

For issues or questions, contact: dev@ionsec.io
