const fs = require('fs');
const path = require('path');
const { pool } = require('./database');
const { logger } = require('../utils/logger');
const { Report } = require('./models');

const REPORTS_DIR = process.env.REPORTS_DIR || '/app/reports';
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const TYPE_LABELS = {
  executive_summary: 'Executive Summary',
  incident_report: 'Incident Report',
  compliance_report: 'Compliance Report',
  threat_analysis: 'Threat Analysis',
  user_activity: 'User Activity Report',
  system_health: 'System Health Report',
  custom: 'Custom Report'
};

async function countIncidents(organizationId) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'new')::int AS new,
       COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
       COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical,
       COUNT(*) FILTER (WHERE severity = 'high')::int AS high
     FROM maes.incidents WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0];
}

async function recentIncidents(organizationId, limit = 10) {
  const r = await pool.query(
    `SELECT title, severity, status, created_at
     FROM maes.incidents
     WHERE organization_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [organizationId, limit]
  );
  return r.rows;
}

async function countAlerts(organizationId) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE severity = 'high' OR severity = 'critical')::int AS high_risk
     FROM maes.alerts WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0];
}

async function recentAlerts(organizationId, limit = 10) {
  const r = await pool.query(
    `SELECT title, severity, status, created_at
     FROM maes.alerts
     WHERE organization_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [organizationId, limit]
  );
  return r.rows;
}

async function complianceSummary(organizationId) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(compliant_controls), 0)::int AS passed,
       COALESCE(SUM(non_compliant_controls), 0)::int AS failed
     FROM maes.compliance_assessments WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0];
}

/**
 * Gather a data snapshot for the requested report type.
 */
async function gatherData(type, organizationId, parameters) {
  const data = { generated_at: new Date().toISOString(), parameters: parameters || {} };

  switch (type) {
    case 'incident_report':
      data.incident_stats = await countIncidents(organizationId);
      data.recent_incidents = await recentIncidents(organizationId, 15);
      break;
    case 'threat_analysis':
      data.alert_stats = await countAlerts(organizationId);
      data.recent_alerts = await recentAlerts(organizationId, 15);
      break;
    case 'compliance_report':
      data.compliance = await complianceSummary(organizationId);
      break;
    case 'user_activity':
      data.activity = await pool.query(
        `SELECT action, COUNT(*)::int AS count
         FROM maes.audit_logs
         WHERE organization_id = $1
         GROUP BY action ORDER BY count DESC LIMIT 15`,
        [organizationId]
      ).then((r) => r.rows);
      break;
    case 'system_health':
      data.services = await pool.query(
        `SELECT 'database' AS service, true AS healthy
         UNION ALL SELECT 'api', true`
      ).then((r) => r.rows);
      break;
    case 'executive_summary':
    case 'custom':
    default:
      data.incident_stats = await countIncidents(organizationId);
      data.alert_stats = await countAlerts(organizationId);
      data.compliance = await complianceSummary(organizationId);
      break;
  }

  return data;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(report, data) {
  const title = report.name;
  const label = TYPE_LABELS[report.type] || report.type;
  const rows = (data.incident_stats && data.recent_incidents) ? `
    <h3>Incidents</h3>
    <table>
      <tr><th>Title</th><th>Severity</th><th>Status</th><th>Created</th></tr>
      ${data.recent_incidents.map((i) => `
        <tr><td>${escapeHtml(i.title)}</td><td>${escapeHtml(i.severity)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.created_at)}</td></tr>`).join('')}
    </table>` : '';
  const alerts = (data.alert_stats && data.recent_alerts) ? `
    <h3>Alerts</h3>
    <table>
      <tr><th>Title</th><th>Severity</th><th>Status</th><th>Created</th></tr>
      ${data.recent_alerts.map((a) => `
        <tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.severity)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.created_at)}</td></tr>`).join('')}
    </table>` : '';
  const compliance = data.compliance ? `
    <h3>Compliance</h3>
    <table>
      <tr><th>Total</th><th>Passed</th><th>Failed</th></tr>
      <tr><td>${escapeHtml(data.compliance.total)}</td><td>${escapeHtml(data.compliance.passed)}</td><td>${escapeHtml(data.compliance.failed)}</td></tr>
    </table>` : '';
  const activity = data.activity ? `
    <h3>Top Activities</h3>
    <table>
      <tr><th>Action</th><th>Count</th></tr>
      ${data.activity.map((a) => `<tr><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.count)}</td></tr>`).join('')}
    </table>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 32px; color: #1a1a1a; }
  h1 { font-size: 24px; } h2 { color: #4a4a4a; } h3 { margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
  th { background: #f5f5f5; }
  .meta { color: #777; font-size: 13px; margin-bottom: 24px; }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Type: ${escapeHtml(label)} &middot; Generated: ${escapeHtml(data.generated_at)}</div>
  ${rows}
  ${alerts}
  ${compliance}
  ${activity}
  <p style="margin-top:32px;color:#999;font-size:12px">Generated by MAES Platform</p>
</body></html>`;
}

function renderJson(report, data) {
  return JSON.stringify({ report: { id: report.id, name: report.name, type: report.type, format: report.format }, data }, null, 2);
}

/**
 * Generate a report artifact synchronously and persist it. The artifact is
 * stored under REPORTS_DIR keyed by report id so the download endpoint can
 * stream it back.
 */
async function generateReport(report) {
  const data = await gatherData(report.type, report.organizationId, report.parameters);

  let content;
  let extension;
  if (report.format === 'json') {
    content = renderJson(report, data);
    extension = 'json';
  } else {
    content = renderHtml(report, data);
    extension = 'html';
  }

  const fileName = `${report.name.replace(/[^a-z0-9-_]+/gi, '-')}-${report.id.slice(0, 8)}.${extension}`;
  const filePath = path.join(REPORTS_DIR, fileName);
  fs.writeFileSync(filePath, content);

  await Report.update(report.id, {
    status: 'completed',
    filePath,
    fileName
  });

  logger.info(`Generated report ${report.id} (${report.type}) -> ${fileName}`);
  return { filePath, fileName };
}

module.exports = { generateReport };
