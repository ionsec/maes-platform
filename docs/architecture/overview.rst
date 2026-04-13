.. _architecture-overview:

Architecture Overview
=====================

MAES follows a microservices architecture with each service owning a distinct responsibility. All services communicate through Redis queues (BullMQ) and a shared PostgreSQL database, while the frontend sits behind an nginx reverse proxy with SSL termination.

High-Level Diagram
-------------------

.. mermaid::

   graph TB
     subgraph "External"
       M365["Microsoft 365"]
       GRAPH["Microsoft Graph API"]
       ENTRA["Microsoft Entra ID"]
     end

     subgraph "MAES Platform — Docker Network"
       subgraph "Frontend Layer"
         FE["React Frontend"]
         NGINX["Nginx Proxy<br/>SSL Termination"]
       end

       subgraph "API Layer"
         API["Express API Server<br/>Auth · WebSocket · Orchestration"]
       end

       subgraph "Worker Layer"
         EXT["Extractor Service<br/>PowerShell"]
         ANA["Analyzer Service<br/>Pattern Detection"]
         COMP["Compliance Service<br/>CIS Assessment"]
       end

       subgraph "Data Layer"
         PG["PostgreSQL 14<br/>TimescaleDB"]
         RD["Redis 7<br/>Queues · Cache · Token Blacklist"]
       end
     end

     M365 --> EXT
     GRAPH --> EXT
     GRAPH --> COMP
     ENTRA --> API

     FE <--> NGINX <--> API
     API <--> PG
     API <--> RD
     API --> EXT
     API --> ANA
     API --> COMP
     EXT --> RD
     ANA --> RD
     COMP --> RD
     EXT <--> PG
     ANA <--> PG
     COMP <--> PG

Service Responsibilities
-------------------------

.. list-table::
   :header-rows: 1
   :widths: 18 30 52

   * - Service
     - Technology
     - Responsibility
   * - API
     - Express + Socket.IO
     - Authentication (JWT), RBAC, route orchestration, upload handling, SIEM export, real-time WebSocket events, Swagger docs
   * - Extractor
     - Node.js + PowerShell
     - Runs Microsoft-Extractor-Suite cmdlets via PowerShell, manages certificate auth, streams progress, triggers automatic analysis
   * - Analyzer
     - Node.js + EnhancedAnalyzer
     - Multi-threaded job processor, blacklist cross-referencing, anomaly detection, finding generation, alert creation
   * - Compliance
     - Node.js + Microsoft Graph
     - CIS v4.0.0 assessment engine, control evaluation, report generation (HTML/JSON/PDF), scheduled assessments
   * - Frontend
     - React 19 + MUI + Vite
     - Dashboard, extractions, analysis, compliance, alerts, settings, onboarding wizard, theme engine

Communication Patterns
-----------------------

**Synchronous (HTTP):**

- Frontend ↔ API: REST + WebSocket
- API ↔ Compliance: Internal HTTP for assessment/report requests

**Asynchronous (BullMQ Queues):**

- ``extraction-jobs``: API → Extractor
- ``analysis-jobs``: Extractor → Analyzer (auto-triggered)
- ``compliance-assessments``: API → Compliance

**Database (PostgreSQL):**

- All services read/write to the ``maes`` schema
- Organizations, users, extractions, analysis jobs, alerts, compliance data

**Cache/State (Redis):**

- Job queues and progress tracking
- JWT token blacklisting
- Extraction log streaming
- Uploaded data caching (24-hour TTL)

Data Flow — Extraction Pipeline
--------------------------------

.. mermaid::

   sequenceDiagram
     participant User
     participant API
     participant Redis
     participant Extractor
     participant Analyzer
     participant DB

     User->>API: POST /api/extractions
     API->>DB: Create extraction record (pending)
     API->>Redis: Enqueue extraction job
     API-->>User: 201 { extraction }

     Redis-->>Extractor: Dequeue job
     Extractor->>Extractor: Authenticate to M365
     Extractor->>Extractor: Run PowerShell cmdlet
     Extractor->>Redis: Stream progress updates
     Extractor->>DB: Update status (completed)
     Extractor->>Redis: Enqueue analysis job

     Redis-->>Analyzer: Dequeue analysis job
     Analyzer->>Analyzer: Cross-reference blacklists
     Analyzer->>Analyzer: Detect patterns & anomalies
     Analyzer->>DB: Store findings & alerts
     Analyzer->>API: Create alerts via API

     User->>API: GET /api/analysis/:id/results
     API-->>User: { findings, alerts }
