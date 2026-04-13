.. _architecture-analyzer:

Analyzer Service
================

The analyzer service processes extracted Microsoft 365 data to detect security anomalies, suspicious patterns, and policy violations. It uses blacklist cross-referencing and configurable thresholds.

Source: ``services/analyzer/src/index.js``

Architecture
-------------

.. mermaid::

   graph TB
     subgraph "Analyzer Service"
       QW["BullMQ Workers"]
       JP["JobProcessor<br/>(Multi-threaded)"]
       EA["EnhancedAnalyzer"]
       BL["Blacklists<br/>7 categories"]
       WL["Whitelists"]
       CF["Config<br/>Thresholds & Lookups"]
     end

     subgraph "Data Sources"
       DB["PostgreSQL"]
       RD["Redis Queues"]
       VOL["Extraction Output<br/>Docker Volume"]
     end

     RD --> QW
     QW --> JP
     JP --> EA
     EA --> BL
     EA --> WL
     EA --> CF
     EA --> DB
     JP --> VOL

Queue Processing
-----------------

The service listens on two BullMQ queues:

- **``analysis-jobs``** — Main analysis queue (from extractor or API)
- **``extraction``** — Secondary extraction processing queue

Workers use the ``JobProcessor`` class for multi-threaded processing and the ``EnhancedAnalyzer`` for detection logic.

Analysis Types
---------------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Type Key
     - Description
   * - ``ual_analysis``
     - Unified Audit Log analysis for suspicious activities
   * - ``signin_analysis``
     - Entra sign-in pattern analysis
   * - ``audit_analysis``
     - Audit and configuration change analysis
   * - ``mfa_analysis``
     - Multi-factor authentication analysis
   * - ``oauth_analysis``
     - OAuth application permission analysis
   * - ``risky_detection_analysis``
     - Identity Protection risky detection analysis
   * - ``risky_user_analysis``
     - Risky or privileged user analysis
   * - ``message_trace_analysis``
     - Email message flow analysis
   * - ``device_analysis``
     - Device posture and security analysis
   * - ``comprehensive_analysis``
     - Broad analysis across supported datasets

Detection Engine — EnhancedAnalyzer
------------------------------------

The ``EnhancedAnalyzer`` class (``services/analyzer/src/enhancedAnalyzer.js``) provides:

**Blacklist Cross-Referencing** — 7 blacklist categories:

- ASN Blacklist
- Application Blacklist
- Application Permission Blacklist
- Country Blacklist
- Delegated Permission Blacklist
- MoveToFolder Blacklist
- UserAgent Blacklist

**Whitelist Support** — ASN whitelist to reduce false positives from known-good ASNs.

**Configurable Thresholds:**

.. list-table::
   :header-rows: 1
   :widths: 35 20 45

   * - Threshold
     - Default
     - Description
   * - ``bruteForce``
     - 1000
     - Attempts in time window
   * - ``failedLogins``
     - 50
     - Failed logins per user
   * - ``suspiciousActivity``
     - 5
     - Suspicious events per user
   * - ``highRisk``
     - 10
     - High-risk event count
   * - ``multipleFailedLoginsPerUser``
     - 10
     - Per-user failed login threshold
   * - ``suspiciousIPActivityCount``
     - 500
     - IP activity count for flagging
   * - ``unusualLocationChanges``
     - 5
     - Location changes for impossible-travel

Analysis Result Flow
---------------------

1. Job is dequeued from Redis
2. ``JobProcessor`` fetches extraction data (from API or local volume)
3. ``EnhancedAnalyzer`` runs the appropriate analysis method
4. Findings are categorized by severity (low/medium/high/critical)
5. Alerts are generated and pushed to the API
6. Results are stored in ``analysis_jobs.results`` (JSONB)

Cleanup
--------

- Old completed/failed jobs are cleaned up every hour (30-day retention)
- The analyzer exposes a cleanup API for organization data removal
- Periodic health checks run every 30 seconds
