.. _overview:

Overview
========

MAES (Microsoft 365 Audit & Exchange Security) Platform is a comprehensive security analytics solution designed to extract, analyze, monitor, and assess compliance for Microsoft 365 and Azure environments.

The platform follows a microservices architecture with specialized services for data extraction, forensic analysis, compliance assessment, and a modern web interface.

Key Capabilities
----------------

- **M365 Data Extraction** — Retrieve audit logs, sign-in logs, mailbox data, OAuth permissions, device info, license details, and more from Microsoft 365 and Azure via PowerShell cmdlets and Microsoft Graph API.

- **Forensic Analysis** — Automated and on-demand analysis of extracted data with blacklist cross-referencing, anomaly detection, pattern recognition, and threat intelligence integration.

- **CIS Compliance Assessment** — Evaluate Microsoft 365 tenant configurations against CIS v4.0.0 benchmarks with entity-level detail, remediation guidance, and scheduled assessments.

- **Real-Time Alerts** — Detect and triage security findings with severity classification, MITRE ATT&CK mapping, and workflow (acknowledge, assign, resolve).

- **SIEM Integration** — Export security events to Splunk, QRadar, Elasticsearch, or generic endpoints in JSON, CEF, CSV, or XML formats.

- **Reporting** — Generate executive summaries, incident reports, compliance reports, threat analysis, and user activity reports in multiple formats.

- **Multi-Tenant Support** — MSSP-ready architecture with organization isolation, role-based access control, and cross-organization visibility for administrators.

Technology Stack
----------------

=============  ====================================  ==============
Component      Technology                            Version
=============  ====================================  ==============
API Server     Node.js / Express                    20+
Frontend       React 19 / Material UI / Vite         19
Database       PostgreSQL 14 / TimescaleDB           14
Cache/Queue    Redis 7 / BullMQ                      7
Extractor      PowerShell / Microsoft-Extractor-Suite  Latest
Analyzer       Node.js / Blacklist-based detection    20+
Compliance     Node.js / Microsoft Graph / MSAL      20+
Monitoring     Prometheus / Grafana / Loki            Latest
=============  ====================================  ==============

Upstream Projects
^^^^^^^^^^^^^^^^^

- **Extractor Suite**: `invictus-ir/Microsoft-Extractor-Suite <https://github.com/invictus-ir/Microsoft-Extractor-Suite>`_
- **Analyzer Suite**: `LETHAL-FORENSICS/Microsoft-Analyzer-Suite <https://github.com/LETHAL-FORENSICS/Microsoft-Analyzer-Suite>`_

Version
-------

Current release: **v1.1.0**

License: MIT
