# MAES Platform Architecture

## Overview

The MAES (Microsoft 365 Audit & Exchange Security) Platform is a comprehensive security analytics solution designed to extract, analyze, monitor, and assess compliance for Microsoft 365 and Azure environments. The platform follows a microservices architecture with specialized services for data extraction, analysis, compliance assessment, and user interface components.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 MAES Platform                                       │
│                           Cloud-Native Security Analysis                           │
└─────────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────┐
                    │              Internet                   │
                    │    ┌─────────────────────────────────┐   │
                    │    │     Microsoft 365 Cloud        │   │
                    │    │  ┌─────────────┐ ┌─────────────┐│   │
                    │    │  │Exchange     │ │Graph API    ││   │
                    │    │  │Online       │ │  (Users,    ││   │
                    │    │  │  (UAL)      │ │  Devices,   ││   │
                    │    │  │             │ │  MFA, etc.) ││   │
                    │    │  └─────────────┘ └─────────────┘│   │
                    │    └─────────────────────────────────┘   │
                    └─────────────────────────────────────────┘
                                     │
                                     │ HTTPS/REST
                                     │ Certificate Auth
                                     │
            ┌─────────────────────────────────────────────────────────────────────────────────────┐
            │                              MAES Platform                                           │
            │                             Docker Network                                          │
            │                                                                                     │
            │  ┌─────────────────────────────────────────────────────────────────────────────┐    │
            │  │                          Frontend Layer                                     │    │
            │  │                                                                             │    │
            │  │  ┌─────────────────────┐      ┌─────────────────────┐                      │    │
            │  │  │   React Frontend    │      │    Nginx Proxy      │                      │    │
            │  │  │                     │◄────►│   SSL Termination   │                      │    │
            │  │  │  • Dashboard        │      │   Load Balancing    │                      │    │
            │  │  │  • Extractions      │      │   Static Files      │                      │    │
            │  │  │  • Analysis         │      │                     │                      │    │
            │  │  │  • Settings         │      │                     │                      │    │
            │  │  └─────────────────────┘      └─────────────────────┘                      │    │
            │  └─────────────────────────────────────────────────────────────────────────────┘    │
            │                                     │                                                │
            │                                     │ HTTP/WebSocket                                 │
            │                                     │                                                │
            │  ┌─────────────────────────────────────────────────────────────────────────────┐    │
            │  │                          API Layer                                          │    │
            │  │                                                                             │    │
            │  │  ┌─────────────────────┐      ┌─────────────────────┐                      │    │
            │  │  │     Node.js API     │      │   Authentication    │                      │    │
            │  │  │                     │      │                     │                      │    │
            │  │  │  • REST Endpoints   │      │  • JWT Tokens       │                      │    │
            │  │  │  • WebSocket        │      │  • RBAC             │                      │    │
            │  │  │  • Job Management   │      │  • Session Mgmt     │                      │    │
            │  │  │  • Real-time Updates│      │  • Audit Logging    │                      │    │
            │  │  └─────────────────────┘      └─────────────────────┘                      │    │
            │  └─────────────────────────────────────────────────────────────────────────────┘    │
            │                                     │                                                │
            │                                     │ BullMQ/Redis                                   │
            │                                     │                                                │
            │  ┌─────────────────────────────────────────────────────────────────────────────┐    │
            │  │                       Processing Layer                                      │    │
            │  │                                                                             │    │
            │  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐│    │
            │  │  │  Extractor Service  │  │  Analyzer Service   │  │ Compliance Service  ││    │
            │  │  │                     │  │                     │  │                     ││    │
            │  │  │  • Native Graph API │  │  • Multi-threaded   │  │  • CIS Benchmarks   ││    │
            │  │  │  • M365 Connection  │  │  • Pattern Analysis │  │  • Certificate Auth ││    │
            │  │  │  • PS Sidecar (T3)  │  │  • MITRE ATT&CK     │  │  • Tenant Analysis  ││    │
            │  │  │  • Data Extraction  │  │  • Alert Generation │  │  • Entity Tracking  ││    │
            │  │  │  • Event Progress  │  │  • Findings Report  │  │  • HTML Reports     ││    │
            │  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘│    │
            │  └─────────────────────────────────────────────────────────────────────────────┘    │
            │                                     │                                                │
            │                                     │ PostgreSQL                                     │
            │                                     │                                                │
            │  ┌─────────────────────────────────────────────────────────────────────────────┐    │
            │  │                         Data Layer                                          │    │
            │  │                                                                             │    │
            │  │  ┌─────────────────────┐      ┌─────────────────────┐                      │    │
            │  │  │   TimescaleDB       │      │    Redis Cache      │                      │    │
            │  │  │                     │      │                     │                      │    │
            │  │  │  • Time-series Data │      │  • Job Queues       │                      │    │
            │  │  │  • Audit Logs       │      │  • Session Store    │                      │    │
            │  │  │  • Analysis Results │      │  • Real-time Data   │                      │    │
            │  │  │  • User Management  │      │  • Progress Cache   │                      │    │
            │  │  │  • Organizations    │      │                     │                      │    │
            │  │  └─────────────────────┘      └─────────────────────┘                      │    │
            │  └─────────────────────────────────────────────────────────────────────────────┘    │
            │                                                                                     │
            │  ┌─────────────────────────────────────────────────────────────────────────────┐    │
            │  │                        Storage Layer                                        │    │
            │  │                                                                             │    │
            │  │  ┌─────────────────────┐      ┌─────────────────────┐                      │    │
            │  │  │   Volume Storage    │      │   Certificate       │                      │    │
            │  │  │                     │      │   Storage           │                      │    │
            │  │  │  • Extraction Data  │      │                     │                      │    │
            │  │  │  • Analysis Reports │      │  • SSL Certificates │                      │    │
            │  │  │  • Logs             │      │  • Azure App Certs  │                      │    │
            │  │  │  • Configurations   │      │  • PKI Storage      │                      │    │
            │  │  └─────────────────────┘      └─────────────────────┘                      │    │
            │  └─────────────────────────────────────────────────────────────────────────────┘    │
            └─────────────────────────────────────────────────────────────────────────────────────┘
```

## Service Communication Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Service Communication Flow                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

    User                Frontend              API                 Extractor          Analyzer
     │                     │                   │                     │                  │
     │   1. Login          │                   │                     │                  │
     │────────────────────►│                   │                     │                  │
     │                     │   2. POST /auth   │                     │                  │
     │                     │──────────────────►│                     │                  │
     │                     │   3. JWT Token    │                     │                  │
     │                     │◄──────────────────│                     │                  │
     │                     │                   │                     │                  │
     │   4. Create         │                   │                     │                  │
     │   Extraction        │                   │                     │                  │
     │────────────────────►│                   │                     │                  │
     │                     │   5. POST         │                     │                  │
     │                     │   /extractions    │                     │                  │
     │                     │──────────────────►│                     │                  │
     │                     │                   │   6. Queue Job      │                  │
     │                     │                   │    (BullMQ)         │                  │
     │                     │                   │────────────────────►│                  │
     │                     │   7. Job Created  │                     │                  │
     │                     │◄──────────────────│                     │                  │
     │                     │                   │                     │                  │
     │                     │                   │                     │   8. Native Graph│
     │                     │                   │                     │   API + PS Sidecar│
     │                     │                   │                     │   (M365/Graph)  │
     │                     │                   │                     │────────────────►│
     │                     │                   │                     │                  │
     │   9. Real-time      │                   │                     │                  │
     │   Progress          │                   │                     │                  │
     │   (WebSocket)       │                   │                     │                  │
     │◄────────────────────│◄──────────────────│◄────────────────────│                  │
     │                     │                   │                     │                  │
     │                     │                   │                     │   10. Queue      │
     │                     │                   │                     │   Analysis       │
     │                     │                   │                     │   (BullMQ)       │
     │                     │                   │                     │─────────────────►│
     │                     │                   │                     │                  │
     │                     │                   │                     │                  │   11. Multi-thread
     │                     │                   │                     │                  │   Analysis
     │                     │                   │                     │                  │   (Worker Pool)
     │                     │                   │                     │                  │
     │                     │                   │   12. Analysis Complete               │
     │                     │                   │◄──────────────────────────────────────│
     │                     │                   │                     │                  │
     │   13. Results       │                   │                     │                  │
     │   Available         │                   │                     │                  │
     │   (WebSocket)       │                   │                     │                  │
     │◄────────────────────│◄──────────────────│                     │                  │
     │                     │                   │                     │                  │
     │   14. View Results  │                   │                     │                  │
     │────────────────────►│                   │                     │                  │
     │                     │   15. GET         │                     │                  │
     │                     │   /analysis/      │                     │                  │
     │                     │   {id}/results    │                     │                  │
     │                     │──────────────────►│                     │                  │
     │                     │   16. Analysis    │                     │                  │
     │                     │   Data            │                     │                  │
     │                     │◄──────────────────│                     │                  │
     │                     │                   │                     │                  │
```

## Detailed Service Architecture

### 1. Frontend Service (React + Nginx)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Frontend Architecture                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                                Nginx Proxy                                      │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   SSL Termination   │  │   Load Balancing    │  │   Static Files      │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • HTTPS/TLS 1.3    │  │  • API Routing      │  │  • React Build      │     │
    │  │  • Certificate Mgmt │  │  • Health Checks    │  │  • Assets           │     │
    │  │  • Security Headers │  │  • Rate Limiting    │  │  • Gzip Compression │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ HTTP/WebSocket
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              React Application                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │     Dashboard       │  │    Extractions      │  │     Analysis        │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Real-time Stats  │  │  • Job Creation     │  │  • Results View     │     │
    │  │  • System Health    │  │  • Progress Monitor │  │  • Finding Details  │     │
    │  │  • Alert Management │  │  • Log Streaming    │  │  • MITRE Mapping    │     │
    │  │  • Monitoring Tools │  │  • Download Files   │  │  • Export Options   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │      Settings       │  │   Organizations     │  │      System         │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • User Profile     │  │  • Tenant Config    │  │  • System Logs      │     │
    │  │  • Credentials      │  │  • Connection Test  │  │  • Container Logs   │     │
    │  │  • Preferences      │  │  • Multi-tenant     │  │  • Raw Log View     │     │
    │  │  • API Keys         │  │  • Access Control   │  │  • Log Filtering    │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### 2. API Service (Node.js)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                API Architecture                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Express.js Layer                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Authentication    │  │      Middleware     │  │     Rate Limiting   │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • JWT Validation   │  │  • CORS Handling    │  │  • Per-user Limits  │     │
    │  │  • Session Mgmt     │  │  • Request Logging  │  │  • IP-based Limits  │     │
    │  │  • RBAC             │  │  • Error Handling   │  │  • API Throttling   │     │
    │  │  • Multi-tenant     │  │  • Validation       │  │  • Abuse Prevention │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                                Route Handlers                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   /api/auth         │  │  /api/extractions   │  │   /api/analysis     │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • POST /login      │  │  • GET /            │  │  • GET /            │     │
    │  │  • POST /logout     │  │  • POST /           │  │  • POST /           │     │
    │  │  • POST /refresh    │  │  • GET /:id         │  │  • GET /:id/results │     │
    │  │  • GET /me          │  │  • POST /:id/cancel │  │  • POST /:id/cancel │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │  /api/organizations │  │    /api/system      │  │    /api/reports     │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • GET /current     │  │  • GET /logs        │  │  • GET /            │     │
    │  │  • PUT /            │  │  • GET /logs/stats  │  │  • POST /           │     │
    │  │  • POST /test-conn  │  │  • Container Filter │  │  • GET /:id         │     │
    │  │  • GET /stats       │  │  • Real-time Data   │  │  • POST /:id/export │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                               Service Layer                                     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │    Job Service      │  │   Database Service  │  │   WebSocket Service │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • BullMQ Queue     │  │  • PostgreSQL ORM  │  │  • Real-time Events │     │
    │  │  • Job Scheduling   │  │  • Query Builder    │  │  • Progress Updates │     │
    │  │  • Priority Mgmt    │  │  • Transaction Mgmt │  │  • Notification Hub │     │
    │  │  • Status Sync      │  │  • Connection Pool  │  │  • Room Management  │     │
    │  │  • Error Handling   │  │  • Retry Logic      │  │  • System Logs      │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Extractor Service (Node.js + Native Graph API + PowerShell Sidecar)


```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     Extractor Architecture (Dual-Path)                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           Job Processing & Dispatch                            │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   BullMQ Worker     │  │  Extraction         │  │   Progress Tracker  │
    │  │                     │  │  Dispatcher          │  │                     │
    │  │  • Queue Consumer   │  │  • Type Registry    │  │  • Event-driven     │
    │  │  • Job Validation   │  │  • isNativeGraph()  │  │  • Phase-based      │
    │  │  • Error Handling   │  │  • requiresPS()     │  │  • BullMQ progress  │
    │  │  • Concurrency     │  │  • Fallback routing  │  │  • Record counting  │
    │  │  • Status Updates   │  │  • Legacy compat    │  │  • API updates      │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                    ┌────────▼────────┐      ┌─────────▼─────────┐
                    │  Tier 1 & 2:    │      │  Tier 3:           │
                    │  Native Graph   │      │  PowerShell Sidecar│
                    └────────┬────────┘      └─────────┬─────────┘
                             │                         │
    ┌────────────────────────▼─────────────────────────▼──────────────────────────────┐
    │                     Native Graph API Path (Tier 1 & 2)                          │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Graph Auth         │  │   Graph Client       │  │   Extractor Modules│     │
    │  │   (graphAuth.js)     │  │   (graphClient.js)   │  │   (extractors/)    │     │
    │  │                     │  │                     │  │                     │
    │  │  • MSAL cert auth   │  │  • @odata.nextLink │  │  • 20 Tier 1       │     │
    │  │  • Token caching    │  │  • Auto pagination │  │  • 3 Tier 2        │     │
    │  │  • Auto refresh     │  │  • 429 rate limit  │  │  • BaseExtractor   │     │
    │  │  • Per-org clients  │  │  • Exponential backoff│ │  • OutputWriter  │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                    PowerShell Sidecar Path (Tier 3)                            │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │  PS Adapter         │  │  Extractor Sidecar   │  │  Exchange Online   │     │
    │  │  (powershellAdapter│  │  (extractor-sidecar) │  │                     │     │
    │  │   .js)              │  │                     │  │  • UAL Extraction   │     │
    │  │                     │  │  • HTTP API :3001   │  │  • Admin Audit      │     │
    │  │  • HTTP client      │  │  • PowerShell 7     │  │  • Mailbox Audit    │     │
    │  │  • Timeout mgmt     │  │  • MS-Extractor-   │  │  • Transport Rules  │     │
    │  │  • Health check     │  │    Suite module     │  │  • Message Trace    │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                     Certificate & Auth Infrastructure                          │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │  Certificate Mgr   │  │  Graph Auth Service  │  │  Connection Testing│     │
    │  │  (certificateManager│  │  (graphAuth.js)      │  │                     │     │
    │  │   .js)              │  │                     │  │  • 4 Graph endpoints│     │
    │  │                     │  │  • MSAL CCA         │  │  • Permission check│     │
    │  │  • PFX parse (forge)│  │  • Client cert auth │  │  • Token validation│     │
    │  │  • Thumbprint calc  │  │  • Token caching    │  │  • Native Graph    │     │
    │  │  • Expiry check     │  │  • Per-org clients  │  │    (no PowerShell) │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

#### Extraction Type Tiers

| Tier | Count | Implementation | Examples |
|------|-------|---------------|----------|
| Tier 1 — Full Graph | 20 | Native `@microsoft/microsoft-graph-client` SDK | sign-in logs, audit logs, MFA status, devices, groups, licenses, conditional access, PIM, risky users, security alerts |
| Tier 2 — Partial Graph | 3 | Graph API with documented limitations | mailbox rules, mailbox audit status, mailbox permissions |
| Tier 3 — PowerShell Sidecar | 5 | HTTP API to `extractor-sidecar` container | unified audit log, admin audit log, mailbox audit, transport rules, message trace |

#### Key Components

- **Extraction Dispatcher** (`extractors/index.js`): Routes extraction types to native Graph extractors or the PowerShell sidecar adapter based on `isNativeGraph()` / `requiresPowerShell()` checks
- **Graph Auth Service** (`auth/graphAuth.js`): MSAL `ConfidentialClientApplication` with per-organization client caching, certificate-based authentication, and automatic token refresh
- **Graph Client Wrapper** (`clients/graphClient.js`): Handles `@odata.nextLink` pagination, 429 rate limiting with exponential backoff + jitter, and retry on 503 errors
- **Certificate Manager** (`auth/certificateManager.js`): Native PFX/PKCS12 parsing via `node-forge` — replaces PowerShell`s `X509Certificate2` for both extraction auth and API cert validation
- **Progress Tracker** (`utils/progressTracker.js`): Event-driven phase tracking (authenticating, fetching, paginating, writing) replaces stdout regex parsing
- **Output Writer** (`utils/outputWriter.js`): JSON/CSV file writing with metadata envelope (format version 2.0, extraction type, timestamp, record count)
- **PowerShell Adapter** (`adapters/powershellAdapter.js`): HTTP client for the sidecar`s `/api/extract` endpoint with timeout and health check support


### 4. Compliance Service (Node.js + Certificate Authentication)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Compliance Service Architecture                           │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Certificate Authentication                           │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   X.509 Certificates│  │   Graph API Client  │  │   Token Management  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • PFX Import       │  │  • MSAL Integration │  │  • Access Tokens    │     │
    │  │  • Private Key Mgmt │  │  • Thumbprint Auth  │  │  • Token Refresh    │     │
    │  │  • Certificate      │  │  • Secure Channels  │  │  • Tenant Routing   │     │
    │  │    Validation       │  │  • Error Handling   │  │  • Permission Scope │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                          Assessment Engine (BullMQ Worker)                     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Job Processing    │  │   Control Execution │  │   Progress Tracking │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Queue Consumer   │  │  • CIS v4.0.0       │  │  • Real-time Updates│     │
    │  │  • Assessment Types │  │    Controls         │  │  • Status Sync      │     │
    │  │  • Priority Mgmt    │  │  • Automated Checks │  │  • Error Handling   │     │
    │  │  • Concurrency     │  │  • Manual Reviews   │  │  • API Communication│     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                         Comprehensive Tenant Analysis                          │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Tenant Information│  │   User Analysis     │  │   Group & Apps      │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Technical Chars  │  │  • Account Types    │  │  • Security Groups  │     │
    │  │  • DNS Domains      │  │  • Guest/Member     │  │  • Distribution Lists│    │
    │  │  • Sync Status      │  │  • External Users   │  │  • Privileged Roles │     │
    │  │  • External Tenants │  │  • Password Policies│  │  • Applications     │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                        Entity-Level Compliance Checking                        │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   MFA Analysis      │  │   Policy Analysis   │  │   Failing Entities  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Global Admin MFA │  │  • Conditional      │  │  • User Details     │     │
    │  │  • User MFA Status  │  │    Access Policies  │  │  • Policy Gaps      │     │
    │  │  • Auth Methods     │  │  • Coverage Gaps    │  │  • Remediation      │     │
    │  │  • Last Sign-in     │  │  • Trust Settings   │  │    Guidance         │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                             Report Generation                                  │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   HTML Reports      │  │   JSON Exports      │  │   Recommendations   │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Executive        │  │  • API Endpoints    │  │  • Risk-based       │     │
    │  │    Summary          │  │  • Structured Data  │  │    Priority         │     │
    │  │  • Detailed Results │  │  • Integration      │  │  • Actionable Steps │     │
    │  │  • Failing Entities │  │    Ready            │  │  • Entity-specific  │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### 5. Analyzer Service (Node.js Multi-threaded)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                             Analyzer Architecture                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           Job Processing & Dispatch                            │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   BullMQ Worker     │  │   Job Processor     │  │   Worker Pool Mgmt  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Queue Consumer   │  │  • Multi-threading  │  │  • Dynamic Scaling  │     │
    │  │  • Job Validation   │  │  • Load Balancing   │  │  • Health Monitoring│     │
    │  │  • Type Routing     │  │  • Error Recovery   │  │  • Resource Mgmt    │     │
    │  │  • Priority Mgmt    │  │  • Progress Tracking│  │  • Failover Handling│     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           Analysis Engine (Worker Threads)                     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Pattern Analysis  │  │   Anomaly Detection │  │   Threat Intelligence│     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Regex Matching   │  │  • Statistical Model│  │  • IoC Matching     │     │
    │  │  • Behavioral Rules │  │  • Time Series      │  │  • Blacklist Check  │     │
    │  │  • Frequency Analysis│ │  • Outlier Detection│  │  • Reputation Scoring│     │
    │  │  • Correlation      │  │  • Baseline Deviation│ │  • Feed Integration │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                          Data Source Analyzers                                 │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Audit Log Analyzer│  │   Sign-in Analyzer  │  │   Device Analyzer   │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Failed Operations│  │  • Impossible Travel │  │  • Compliance Check │     │
    │  │  • Privilege Escal  │  │  • Brute Force      │  │  • Unmanaged Devices│     │
    │  │  • Admin Activities │  │  • Suspicious Locations│ │  • Legacy OS       │     │
    │  │  • After Hours      │  │  • MFA Bypass       │  │  • Certificate Issues│     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   MFA Analyzer      │  │   User Analyzer     │  │   License Analyzer  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Disabled MFA     │  │  • Inactive Users   │  │  • Expired Licenses │     │
    │  │  • Weak Methods     │  │  • Guest Accounts   │  │  • Underutilized    │     │
    │  │  • Bypass Attempts  │  │  • Privileged Access│  │  • Cost Optimization│     │
    │  │  • Policy Violations│  │  • Account Lifecycle│  │  • Compliance Risk  │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Output Generation                                    │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Finding Generator │  │   Alert Generator   │  │   Report Generator  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • MITRE ATT&CK     │  │  • Severity Rating  │  │  • Executive Summary│     │
    │  │  • Evidence Chain   │  │  • Escalation Rules │  │  • Technical Details│     │
    │  │  • Recommendations  │  │  • Notification Hub │  │  • Trend Analysis   │     │
    │  │  • Risk Scoring     │  │  • Webhook Delivery │  │  • Export Formats   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                Data Flow Diagram                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

Microsoft 365          MAES Platform              Data Processing           Analysis
    Cloud               Ingestion                    Pipeline                 Engine
      │                     │                          │                        │
      │                     │                          │                        │
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│                 │   │                 │   │                 │   │                 │
│  Exchange       │   │   Extractor     │   │   Data          │   │   Analyzer      │
│  Online         │   │   Service       │   │   Validation    │   │   Service       │
│                 │   │                 │   │                 │   │                 │
│  ┌─────────────┐│   │  ┌─────────────┐│   │  ┌─────────────┐│   │  ┌─────────────┐│
│  │ UAL         ││   │  │ Native Graph││   │  │ Format      ││   │  │ Pattern     ││
│  │ Mailbox     ││◄──┤  │ API + PS    ││──►│  │ Validation  ││──►│  │ Matching    ││
│  │ Message     ││   │  │ Sidecar     ││   │  │ Deduplication│   │  │ Anomaly     ││
│  │ Trace       ││   │  │ Event Prog. ││   │  │ Enrichment  ││   │  │ Detection   ││
│  └─────────────┘│   │  └─────────────┘│   │  └─────────────┘│   │  └─────────────┘│
│                 │   │                 │   │                 │   │                 │
│  Graph API      │   │   Certificate   │   │   Time Series   │   │   Multi-thread  │
│                 │   │   Authentication│   │   Storage       │   │   Processing    │
│  ┌─────────────┐│   │  ┌─────────────┐│   │  ┌─────────────┐│   │  ┌─────────────┐│
│  │ Users       ││   │  │ Tenant      ││   │  │ TimescaleDB ││   │  │ Worker Pool ││
│  │ Devices     ││◄──┤  │ Routing     ││──►│  │ Indexing    ││──►│  │ Load        ││
│  │ MFA Status  ││   │  │ Token Mgmt  ││   │  │ Partitioning││   │  │ Balancing   ││
│  │ Licenses    ││   │  │ Error       ││   │  │ Compression ││   │  │ Fault       ││
│  │ Sign-ins    ││   │  │ Handling    ││   │  │             ││   │  │ Tolerance   ││
│  └─────────────┘│   │  └─────────────┘│   │  └─────────────┘│   │  └─────────────┘│
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
                                                     │                        │
                                                     │                        │
                                                     ▼                        ▼
                                           ┌─────────────────┐   ┌─────────────────┐
                                           │                 │   │                 │
                                           │   Data Lake     │   │   Analysis      │
                                           │   (PostgreSQL)  │   │   Results       │
                                           │                 │   │                 │
                                           │  ┌─────────────┐│   │  ┌─────────────┐│
                                           │  │ Raw Data    ││   │  │ Findings    ││
                                           │  │ Processed   ││   │  │ Alerts      ││
                                           │  │ Data        ││   │  │ Reports     ││
                                           │  │ Metadata    ││   │  │ Metrics     ││
                                           │  └─────────────┘│   │  └─────────────┘│
                                           │                 │   │                 │
                                           │  ┌─────────────┐│   │  ┌─────────────┐│
                                           │  │ Audit Trail ││   │  │ MITRE       ││
                                           │  │ User Sessions│   │  │ ATT&CK      ││
                                           │  │ API Logs    ││   │  │ Mapping     ││
                                           │  │ System Events│   │  │ Risk Scores ││
                                           │  └─────────────┘│   │  └─────────────┘│
                                           └─────────────────┘   └─────────────────┘
                                                     │                        │
                                                     │                        │
                                                     ▼                        ▼
                                           ┌─────────────────┐   ┌─────────────────┐
                                           │                 │   │                 │
                                           │   Frontend      │   │   External      │
                                           │   Dashboard     │   │   Integrations  │
                                           │                 │   │                 │
                                           │  ┌─────────────┐│   │  ┌─────────────┐│
                                           │  │ Real-time   ││   │  │ SIEM        ││
                                           │  │ Updates     ││   │  │ Integration ││
                                           │  │ Interactive ││   │  │ Webhooks    ││
                                           │  │ Visualizations│   │  │ API Export  ││
                                           │  └─────────────┘│   │  └─────────────┘│
                                           └─────────────────┘   └─────────────────┘
```

## Network Topology

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Network Topology                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

External Network                    Docker Bridge Network                 Internal Network
     │                                 (maes-network)                          │
     │                                                                          │
┌─────────────┐                                                          ┌─────────────┐
│             │                                                          │             │
│  Internet   │                                                          │  Microsoft  │
│             │                                                          │  365 Cloud  │
│  ┌─────────┐│                                                          │             │
│  │  Users  ││                                                          │  ┌─────────┐│
│  │  Admins ││                                                          │  │Exchange ││
│  │  Analysts││                                                          │  │Online   ││
│  │         ││                                                          │  │Graph API││
│  └─────────┘│                                                          │  │         ││
│             │                                                          │  └─────────┘│
└─────────────┘                                                          └─────────────┘
     │                                                                          │
     │ HTTPS (443)                                                              │ HTTPS/API
     │                                                                          │
     ▼                                                                          ▲
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│  ┌─────────────────────┐                                                          │
│  │   maes-frontend     │                                                          │
│  │   (React + Nginx)   │                                                          │
│  │                     │                                                          │
│  │  Port: 80, 443      │                                                          │
│  │  SSL: Terminated    │                                                          │
│  │  Network: maes-net  │                                                          │
│  └─────────────────────┘                                                          │
│             │                                                                     │
│             │ HTTP (Internal)                                                     │
│             │                                                                     │
│             ▼                                                                     │
│  ┌─────────────────────┐              ┌─────────────────────┐                    │
│  │     maes-api        │              │    maes-redis       │                    │
│  │   (Node.js API)     │◄────────────►│   (Job Queue)       │                    │
│  │                     │              │                     │                    │
│  │  Port: 3000         │              │  Port: 6379         │                    │
│  │  Internal Only      │              │  Internal Only      │                    │
│  │  Network: maes-net  │              │  Network: maes-net  │                    │
│  └─────────────────────┘              └─────────────────────┘                    │
│             │                                    │                               │
│             │                                    │                               │
│             ▼                                    ▼                               │
│  ┌─────────────────────┐              ┌─────────────────────┐                    │
│  │   maes-postgres     │              │  maes-extractor     │                    │
│  │   (TimescaleDB)     │◄────────────►│  (Data Extraction)  │──────────────────────┤
│  │                     │              │                     │                    │
│  │  Port: 5432         │              │  No External Port   │                    │
│  │  Exposed for Dev    │              │  Network: maes-net  │                    │
│  │  Network: maes-net  │              │  Graph API + Sidecar│                    │
│  └─────────────────────┘              └─────────────────────┘                    │
│             │                                    │                               │
│             │                                    │                               │
│             ▼                                    ▼                               │
│  ┌─────────────────────┐              ┌─────────────────────┐                    │
│  │                     │              │   maes-analyzer     │                    │
│  │   Volume Storage    │              │  (Analysis Engine)  │                    │
│  │                     │              │                     │                    │
│  │  • postgres_data    │              │  No External Port   │                    │
│  │  • redis_data       │              │  Network: maes-net  │                    │
│  │  • extractor_output │              │  Multi-threaded     │                    │
│  │  • analyzer_output  │              │  Worker Pool        │                    │
│  │  • certificates     │              │                     │                    │
│  └─────────────────────┘              └─────────────────────┘                    │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

Network Configuration:
├── External Access
│   ├── HTTP (80) → HTTPS Redirect
│   ├── HTTPS (443) → Frontend
│   └── SSH (22) → Host Access (Optional)
├── Internal Communication
│   ├── API → Database (5432)
│   ├── API → Redis (6379)
│   ├── Services → Redis (6379)
│   └── Services → Database (5432)
└── Service Discovery
    ├── Docker DNS Resolution
    ├── Container Names as Hostnames
    └── Health Check Integration
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Security Architecture                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────────────────┐
                    │                    Security Layers                              │
                    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Network Security                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   SSL/TLS 1.3       │  │   Network Isolation │  │   Firewall Rules    │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Certificate Mgmt │  │  • Docker Networks  │  │  • Port Restrictions│     │
    │  │  • Perfect Forward  │  │  • Internal Only    │  │  • IP Whitelisting  │     │
    │  │  • Secrecy          │  │  • Service Discovery│  │  • Rate Limiting    │     │
    │  │  • HSTS Headers     │  │  • DNS Resolution   │  │  • DDoS Protection  │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Authentication & Authorization                        │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   JWT Tokens        │  │   RBAC System       │  │   Multi-tenancy     │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Signed Tokens    │  │  • Role-based Access│  │  • Tenant Isolation │     │
    │  │  • Refresh Tokens   │  │  • Permission Matrix│  │  • Data Segregation │     │
    │  │  • Token Rotation   │  │  • Least Privilege  │  │  • Resource Quotas  │     │
    │  │  • Secure Storage   │  │  • Audit Logging    │  │  • Access Control   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Data Protection                                    │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Encryption        │  │   Secrets Management│  │   Data Anonymization│     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Data at Rest     │  │  • Credential Vault │  │  • PII Masking      │     │
    │  │  • Data in Transit  │  │  • Key Rotation     │  │  • Sensitive Data   │     │
    │  │  • Database Encryption│ │  • Secure Injection│  │  • Removal          │     │
    │  │  • Volume Encryption│  │  • Environment Vars │  │  • Audit Logging    │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           Microsoft 365 Security                               │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Certificate Auth  │  │   API Permissions   │  │   Connection Security│     │
    │  │                     │  │                     │  │                     │     │
    │  │  • X.509 Certificates│ │  • Minimal Permissions│ │  • Secure Channels │     │
    │  │  • Private Key Mgmt │  │  • App Registration │  │  • Token Validation │     │
    │  │  • Certificate       │  │  • Consent Framework│  │  • Retry Logic      │     │
    │  │  • Rotation         │  │  • Audit Trail      │  │  • Error Handling   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            Deployment Architecture                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

Production Environment                  Development Environment          CI/CD Pipeline
         │                                        │                          │
         │                                        │                          │
┌─────────────────┐                    ┌─────────────────┐           ┌─────────────────┐
│                 │                    │                 │           │                 │
│   Docker Swarm  │                    │   Docker        │           │   GitHub        │
│   or Kubernetes │                    │   Compose       │           │   Actions       │
│                 │                    │                 │           │                 │
│  ┌─────────────┐│                    │  ┌─────────────┐│           │  ┌─────────────┐│
│  │ Load        ││                    │  │ Local       ││           │  │ Build       ││
│  │ Balancer    ││                    │  │ Development ││           │  │ Pipeline    ││
│  │ (HAProxy)   ││                    │  │ Hot Reload  ││           │  │ Test Suite  ││
│  │             ││                    │  │ Debug Mode  ││           │  │ Security    ││
│  └─────────────┘│                    │  └─────────────┘│           │  │ Scanning    ││
│                 │                    │                 │           │  └─────────────┘│
│  ┌─────────────┐│                    │  ┌─────────────┐│           │                 │
│  │ Multiple    ││                    │  │ Single      ││           │  ┌─────────────┐│
│  │ Instances   ││                    │  │ Instance    ││           │  │ Deployment  ││
│  │ Auto-scaling││                    │  │ Resource    ││           │  │ Automation  ││
│  │ Health Check││                    │  │ Sharing     ││           │  │ Rollback    ││
│  │             ││                    │  │             ││           │  │ Strategy    ││
│  └─────────────┘│                    │  └─────────────┘│           │  └─────────────┘│
│                 │                    │                 │           │                 │
│  ┌─────────────┐│                    │  ┌─────────────┐│           │  ┌─────────────┐│
│  │ Persistent  ││                    │  │ Local       ││           │  │ Container   ││
│  │ Storage     ││                    │  │ Volumes     ││           │  │ Registry    ││
│  │ Backup      ││                    │  │ File System ││           │  │ Versioning  ││
│  │ Replication ││                    │  │ Access      ││           │  │ Scanning    ││
│  └─────────────┘│                    │  └─────────────┘│           │  └─────────────┘│
└─────────────────┘                    └─────────────────┘           └─────────────────┘
         │                                        │                          │
         │                                        │                          │
         ▼                                        ▼                          ▼
┌─────────────────┐                    ┌─────────────────┐           ┌─────────────────┐
│                 │                    │                 │           │                 │
│   Monitoring    │                    │   Development   │           │   Quality       │
│   & Alerting    │                    │   Tools         │           │   Assurance     │
│                 │                    │                 │           │                 │
│  ┌─────────────┐│                    │  ┌─────────────┐│           │  ┌─────────────┐│
│  │ Prometheus  ││                    │  │ VS Code     ││           │  │ Unit Tests  ││
│  │ Grafana     ││                    │  │ Extensions  ││           │  │ Integration ││
│  │ AlertManager││                    │  │ Debugger    ││           │  │ Tests       ││
│  │ Log Aggr    ││                    │  │ Linting     ││           │  │ E2E Tests   ││
│  └─────────────┘│                    │  └─────────────┘│           │  └─────────────┘│
└─────────────────┘                    └─────────────────┘           └─────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Technology Stack                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

Frontend Stack                 Backend Stack                  Infrastructure Stack
      │                           │                               │
      │                           │                               │
┌─────────────────┐     ┌─────────────────┐              ┌─────────────────┐
│                 │     │                 │              │                 │
│   React 18      │     │   Node.js 18    │              │   Docker        │
│   TypeScript    │     │   Express.js    │              │   Docker        │
│   Material-UI   │     │   BullMQ        │              │   Compose       │
│   Axios         │     │   Socket.io     │              │   Alpine Linux  │
│   React Router  │     │   Joi           │              │                 │
│   React Hook    │     │   Helmet        │              │                 │
│   Form          │     │   CORS          │              │                 │
│   Notistack     │     │   Rate Limiter  │              │                 │
│                 │     │                 │              │                 │
└─────────────────┘     └─────────────────┘              └─────────────────┘
      │                           │                               │
      │                           │                               │
┌─────────────────┐     ┌─────────────────┐              ┌─────────────────┐
│                 │     │                 │              │                 │
│   Build Tools   │     │   Data Layer    │              │   Orchestration │
│                 │     │                 │              │                 │
│   Vite          │     │   PostgreSQL    │              │   Kubernetes    │
│   ESLint        │     │   TimescaleDB   │              │   (Optional)    │
│   Prettier      │     │   Redis 7       │              │   Docker Swarm  │
│   PostCSS       │     │   Sequelize     │              │   (Optional)    │
│                 │     │   Connection    │              │                 │
│                 │     │   Pooling       │              │                 │
│                 │     │                 │              │                 │
└─────────────────┘     └─────────────────┘              └─────────────────┘
      │                           │                               │
      │                           │                               │
┌─────────────────┐     ┌─────────────────┐              ┌─────────────────┐
│                 │     │                 │              │                 │
│   Web Server    │     │   Processing    │              │   Monitoring    │
│                 │     │                 │              │                 │
│   Nginx         │     │   Graph API     │              │   Prometheus    │
│   SSL/TLS       │     │   + PS Sidecar  │              │   Grafana       │
│   Compression   │     │   Worker        │              │   AlertManager  │
│   Static Files  │     │   Multi-        │              │   Loki          │
│   Proxy         │     │   processing    │              │   Jaeger        │
│   Load          │     │   Pattern       │              │   OpenTelemetry │
│   Balancing     │     │   Matching      │              │                 │
│                 │     │                 │              │                 │
└─────────────────┘     └─────────────────┘              └─────────────────┘
```

## Performance Characteristics

| Component | Concurrent Users | Throughput | Latency | Storage |
|-----------|------------------|------------|---------|---------|
| Frontend | 100+ | 1000+ req/min | <200ms | Stateless |
| API | 50+ | 5000+ req/min | <100ms | Session Cache |
| Extractor | 10+ jobs | 1GB/min | 1-30 min | Temporary |
| Analyzer | 20+ jobs | 10M+ events/min | 30s-5min | Persistent |
| Compliance | 5+ assessments | 1000+ controls/min | 2-15 min | Assessment Results |
| Database | 100+ connections | 10K+ queries/sec | <10ms | Petabyte+ |

## Scalability Considerations

- **Horizontal Scaling**: Multiple instances of each service
- **Load Balancing**: Nginx proxy with health checks
- **Queue Management**: BullMQ with Redis clustering
- **Database Sharding**: TimescaleDB time-based partitioning
- **Resource Limits**: Docker resource constraints
- **Auto-scaling**: Kubernetes HPA (optional)

## Service Communication & Status Synchronization

The MAES platform implements robust service-to-service communication with comprehensive status synchronization between the extractor service and API layer.

### Status Synchronization Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Service Status Synchronization                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Authentication Layer                                 │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Service Tokens    │  │   IP Validation     │  │   Request Routing   │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Internal Auth    │  │  • IPv6/IPv4 Handle │  │  • API Endpoints    │     │
    │  │  • Token Validation │  │  • Container Network│  │  • Internal Routes  │     │
    │  │  • Secure Channels  │  │  • Trust Boundaries │  │  • Service Discovery│     │
    │  │  • Timing Safe      │  │  • Security Zones   │  │  • Load Balancing   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Status Update Flow                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Extractor Job     │  │   Status Updates    │  │   Database Sync     │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Job Execution    │  │  • Retry Logic      │  │  • Real-time State  │     │
    │  │  • Progress Track   │  │  • Exponential      │  │  • Status Columns   │     │
    │  │  • Completion       │  │    Backoff          │  │  • Progress Updates │     │
    │  │  • Error Handling   │  │  • Error Recovery   │  │  • Metadata Storage │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **IPv6-mapped IPv4 Support**: Handles container networking with proper IP normalization
- **Exponential Backoff Retry**: 3 attempts with 2-second delays for failed status updates  
- **Service Token Authentication**: Secure internal communication between services
- **Real-time Synchronization**: Immediate status updates reflected in the database and UI
- **Comprehensive Error Handling**: Graceful degradation with detailed error logging

## System Logs Architecture

The platform features an enhanced system logs infrastructure providing real-time access to container logs and system monitoring data.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              System Logs Architecture                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Frontend Interface                                 │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   SystemLogs Page   │  │   Container Filter  │  │   Raw Log Viewer    │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Real-time Data   │  │  • All Containers   │  │  • Full Log Details │     │
    │  │  • Search/Filter    │  │  • maes-api         │  │  • JSON Parsing     │     │
    │  │  • Severity Levels  │  │  • maes-extractor   │  │  • Metadata Display │     │
    │  │  • Time Navigation  │  │  • maes-analyzer    │  │  • Copy Functions   │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ HTTPS/API
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              API Layer                                          │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Public Endpoints  │  │   Internal Service  │  │   Authentication    │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • /api/system/logs │  │  • /api/internal/   │  │  • Permission Check │     │
    │  │  • /api/system/     │  │    system-logs      │  │  • Service Tokens   │     │
    │  │    logs/stats       │  │  • Docker Commands  │  │  • RBAC Validation  │     │
    │  │  • Pagination       │  │  • Log Parsing      │  │  • Admin Access     │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### System Logs Features

- **Multi-Container Support**: Aggregates logs from all MAES platform containers
- **Real-time Processing**: Live log streaming with automatic updates
- **Advanced Filtering**: Search by container, log level, time range, and content
- **Raw Log Access**: Complete unprocessed log data with JSON parsing
- **Secure Access**: Requires `canManageSystemSettings` permission for access
- **Performance Optimized**: Efficient pagination and caching for large log volumes

## Real-time Alerts Architecture

The MAES platform includes a comprehensive real-time alerts system that provides immediate notification of security events and system status updates.

### Alert Management System

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            Alert Management Architecture                            │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Alert Generation                                   │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │  Analysis Engine    │  │   System Monitor    │  │   External Sources  │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Security         │  │  • Service Health   │  │  • API Webhooks     │     │
    │  │    Findings         │  │  • Resource Usage   │  │  • Monitoring Tools │     │
    │  │  • Threat Detection │  │  • Error Tracking   │  │  • Third-party      │     │
    │  │  • Anomaly Reports  │  │  • Performance     │  │    Integrations     │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                             Alert Processing                                    │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │  Severity Classification │ │   Deduplication   │  │    Enrichment       │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Critical         │  │  • Similar Alerts   │  │  • Context Data     │     │
    │  │  • High             │  │  • Time Windows     │  │  • Related Events   │     │
    │  │  • Medium           │  │  • Pattern Matching │  │  • User Information │     │
    │  │  • Low              │  │  • Alert Grouping   │  │  • Historical Data  │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              Alert Storage                                      │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   PostgreSQL        │  │     Redis Cache     │  │   Real-time State   │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Persistent       │  │  • Active Alerts    │  │  • Unread Count     │     │
    │  │    Storage          │  │  • Quick Access     │  │  • Live Statistics  │     │
    │  │  • Historical Data  │  │  • Session Data     │  │  • User Preferences │     │
    │  │  • Audit Trail      │  │  • Fast Retrieval   │  │  • Filter State     │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            Alert Delivery                                       │
    │                                                                                 │
    │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
    │  │   Header Badge      │  │   Alert Popover     │  │   External Delivery │     │
    │  │                     │  │                     │  │                     │     │
    │  │  • Real-time Count  │  │  • Detailed List    │  │  • Email Notifications│    │
    │  │  • Severity Colors  │  │  • Mark as Read     │  │  • Webhook Delivery │     │
    │  │  • Visual Indicator │  │  • Dismiss Actions  │  │  • SIEM Integration │     │
    │  │  • Click Navigation │  │  • Time Stamps      │  │  • API Endpoints    │     │
    │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Alert Integration

The header component now features a comprehensive alerts system:

- **Real-time Badge**: Shows unread alert count with severity-based color coding
- **Interactive Popover**: Displays detailed alert information with management actions
- **Shared State**: Uses `useAlerts` React hook for consistent data across components
- **Auto-refresh**: Automatically updates alert counts and status in real-time

### Monitoring Services Integration

The platform now includes integrated access to monitoring tools directly from the frontend:

- **Grafana**: Interactive dashboards and data visualization (https://localhost/grafana/)
- **Prometheus**: Metrics collection and monitoring (https://localhost/prometheus/)
- **Loki**: Log aggregation via Grafana Explore interface
- **cAdvisor**: Container resource monitoring (https://localhost/cadvisor/)

These services are accessible through both the header toolbar and sidebar navigation, with proper nginx proxy configuration to handle routing and static asset serving.

## Compliance Assessment Architecture

The MAES platform now includes comprehensive compliance assessment capabilities built on industry-standard frameworks with deep Microsoft 365 integration.

### CIS Microsoft 365 v4.0.0 Benchmark Implementation

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        Compliance Assessment Workflow                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

    User Request                Assessment Engine               Microsoft Graph API
         │                           │                               │
         │                           │                               │
    ┌─────────────────┐     ┌─────────────────┐              ┌─────────────────┐
    │                 │     │                 │              │                 │
    │  1. Initiate    │────►│  2. Validate    │              │  Microsoft 365  │
    │  Assessment     │     │  Credentials    │              │  Tenant         │
    │                 │     │                 │              │                 │
    │  • Select Type  │     │  • Certificate  │              │  • Exchange     │
    │  • CIS v4.0.0   │     │    Authentication│◄────────────►│    Online       │
    │  • Organization │     │  • Permissions  │              │  • Graph API    │
    │                 │     │    Check        │              │  • Users/Groups │
    └─────────────────┘     │                 │              │  • Policies     │
                            │  3. Collect     │              │                 │
                            │  Tenant Data    │              └─────────────────┘
                            │                 │                       │
                            │  • Users (999+) │◄──────────────────────┤
                            │  • Groups       │                       │
                            │  • Applications │                       │
                            │  • Domains      │                       │
                            │  • Licenses     │                       │
                            │  • Roles        │                       │
                            └─────────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │                 │
                            │  4. Execute     │
                            │  Control        │
                            │  Checks         │
                            │                 │
                            │  • MFA Status   │
                            │  • CA Policies  │
                            │  • Admin Users  │
                            │  • App Security │
                            │  • Entity-level │
                            │    Details      │
                            │                 │
                            └─────────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐              ┌─────────────────┐
                            │                 │              │                 │
                            │  5. Generate    │─────────────►│  6. Deliver     │
                            │  Reports        │              │  Results        │
                            │                 │              │                 │
                            │  • Executive    │              │  • Multi-tab UI │
                            │    Summary      │              │  • HTML Reports │
                            │  • Failing      │              │  • JSON Export  │
                            │    Entities     │              │  • Real-time    │
                            │  • Remediation  │              │    Updates      │
                            │    Guidance     │              │                 │
                            │                 │              │                 │
                            └─────────────────┘              └─────────────────┘
```

### Key Compliance Features

#### Comprehensive Tenant Analysis
- **Technical Characteristics**: Complete organizational overview including tenant ID, creation date, regions, and DNS configuration
- **User Account Analysis**: Detailed breakdown of user types (guests, members, external), password policies, and account status
- **Group & Application Inventory**: Security groups, distribution lists, privileged roles, and application security assessment
- **Synchronization Status**: Hybrid vs cloud-only environment detection with sync health monitoring

#### Entity-Level Compliance Tracking
- **Failing User Identification**: Specific users who fail compliance checks with detailed information:
  - User Principal Name (UPN), last sign-in details, account status
  - MFA configuration status and authentication method details
  - Role assignments and privileged access analysis
- **Policy Gap Analysis**: Identification of conditional access policy coverage gaps
- **Remediation Guidance**: Actionable steps for each failing entity with priority classification

#### Advanced Reporting Capabilities
- **Executive Summary**: High-level compliance metrics with trend analysis
- **Detailed HTML Reports**: Comprehensive reports with tenant overview, failing entities, and remediation guidance
- **Multi-format Export**: JSON and HTML formats for integration and presentation
- **Real-time Progress**: Live assessment progress with WebSocket updates

#### Certificate-Based Security
- **X.509 Certificate Authentication**: Secure Microsoft Graph API integration using certificates instead of client secrets
- **MSAL Integration**: Modern authentication with token management and refresh capabilities
- **Tenant Routing**: Multi-tenant support with proper credential isolation

### Compliance Assessment Database Schema

The platform stores comprehensive compliance data including:
- **Assessment Records**: Complete audit trail of all assessments with metadata
- **Control Results**: Detailed results for each CIS control with evidence and remediation
- **Tenant Information**: Cached organizational data for trending and comparison
- **Failing Entities**: Detailed entity information for targeted remediation

This compliance architecture provides enterprise-grade security assessment capabilities with deep Microsoft 365 integration, enabling organizations to maintain continuous compliance monitoring and detailed remediation tracking.

This architecture provides a robust, scalable, and secure foundation for the MAES platform, enabling comprehensive Microsoft 365 security analysis with enterprise-grade capabilities, real-time monitoring integration, and industry-standard compliance assessment.