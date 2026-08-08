const axios = require('axios');
const db = require('../services/database');
const { logger } = require('../logger');
const { diffFindings, diffAttackPaths } = require('./comparison');

/**
 * Raise alerts for exposures that have just appeared.
 *
 * The design constraint here is noise. A recurring weekly scan of a tenant with
 * twelve standing findings must not produce twelve alerts every week — that
 * trains people to ignore the channel, which is worse than not alerting at all.
 * So alerts are raised for *change*, not for state:
 *
 *   - only findings absent from the previous scan of the same domain
 *   - only high and critical severity, or a finding that escalated into them
 *   - plus any newly-assembled attack path, which is a step change in risk
 *     even when its constituent findings were individually already known
 *
 * The first scan of a domain has no predecessor. Alerting on everything it
 * finds would be correct in principle but arrives as a wall of alerts during
 * onboarding, so a baseline scan raises a single summary alert instead.
 */

/** Severities that warrant an alert. The alerts table has no 'info' level. */
const ALERTING_SEVERITIES = new Set(['critical', 'high']);

const ALERT_TYPE = 'external_exposure';
const ALERT_CATEGORY = 'attack_surface';

/**
 * Most recent completed scan of the same domain at the same profile, excluding
 * the one just finished. Profile has to match: a passive predecessor would make
 * every standard-only finding look new.
 */
async function findPreviousScan(scan) {
  return db.getRow(
    `SELECT * FROM maes.recon_scans
      WHERE organization_id = $1
        AND seed_domain = $2
        AND profile = $3
        AND status = 'completed'
        AND id <> $4
        AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1`,
    [scan.organization_id, scan.seed_domain, scan.profile, scan.id]
  );
}

/**
 * Emit alerts for a completed scan.
 *
 * @param {Object} scan - the recon_scans row
 * @param {Object[]} findings - findings as stored (snake_case columns)
 * @param {Object[]} attackPaths - attack paths as stored
 * @returns {Promise<{alerts: Object[], reason: string}>}
 */
async function raiseAlertsForScan(scan, findings = [], attackPaths = []) {
  const exposures = findings.filter(f => !f.is_lead);
  const previous = await findPreviousScan(scan);

  if (!previous) {
    const alert = await raiseBaselineAlert(scan, exposures, attackPaths);
    const alerts = alert ? [alert] : [];
    await notifyAlertsCreated(scan.organization_id, alerts);
    return { alerts, reason: 'baseline' };
  }

  const [previousFindings, previousPaths] = await Promise.all([
    db.getRows(`SELECT * FROM maes.recon_findings WHERE scan_id = $1 AND is_lead = false`, [previous.id]),
    db.getRows(`SELECT * FROM maes.recon_attack_paths WHERE scan_id = $1`, [previous.id])
  ]);

  const findingDrift = diffFindings(previousFindings, exposures);
  const pathDrift = diffAttackPaths(previousPaths, attackPaths);

  const newlySevere = [
    ...findingDrift.added.filter(f => ALERTING_SEVERITIES.has(f.severity)),
    // A finding that escalated into high/critical is new information even
    // though the finding itself is not new.
    ...findingDrift.severityChanged.filter(f =>
      f.direction === 'worsened' && ALERTING_SEVERITIES.has(f.severity))
  ];

  const alerts = [];

  for (const finding of newlySevere) {
    alerts.push(await createAlert({
      organizationId: scan.organization_id,
      severity: finding.severity,
      title: finding.previousSeverity
        ? `Exposure escalated to ${finding.severity}: ${finding.title}`
        : `New external exposure: ${finding.title}`,
      description: buildFindingDescription(scan, finding, previous),
      source: {
        service: 'compliance',
        component: 'external_exposure',
        scanId: scan.id,
        previousScanId: previous.id,
        phase: finding.phase,
        seedDomain: scan.seed_domain,
        profile: scan.profile
      },
      affectedEntities: finding.target ? { targets: [finding.target] } : {},
      evidence: finding.evidence || {},
      mitreTechniques: finding.mitre_technique ? [finding.mitre_technique] : [],
      recommendations: finding.remediation ? [finding.remediation] : [],
      tags: ['external-exposure', finding.finding_id, ...(finding.tags || [])],
      metadata: {
        findingId: finding.finding_id,
        findingUuid: finding.id,
        previousSeverity: finding.previousSeverity || null
      }
    }));
  }

  for (const path of pathDrift.added) {
    alerts.push(await createAlert({
      organizationId: scan.organization_id,
      // Attack paths describe a route an attacker can walk end to end, so they
      // are graded at least high regardless of the template's own severity.
      severity: path.severity === 'critical' ? 'critical' : 'high',
      title: `New attack path: ${path.name}`,
      description: buildPathDescription(scan, path),
      source: {
        service: 'compliance',
        component: 'external_exposure',
        scanId: scan.id,
        previousScanId: previous.id,
        seedDomain: scan.seed_domain,
        profile: scan.profile
      },
      affectedEntities: { seedDomain: scan.seed_domain },
      evidence: { triggerTags: path.trigger_tags, effort: path.effort, blastRadius: path.blast_radius },
      mitreTechniques: path.mitre_techniques || [],
      recommendations: [
        'Break the chain at its cheapest link: resolving any one of the triggering findings '
        + 'removes the path.'
      ],
      tags: ['external-exposure', 'attack-path', path.path_id],
      metadata: { pathId: path.path_id, effort: path.effort }
    }));
  }

  if (alerts.length > 0) {
    logger.info(
      `Scan ${scan.id}: raised ${alerts.length} alert(s) for newly-appeared exposures on ${scan.seed_domain}`
    );
  } else {
    logger.debug(`Scan ${scan.id}: no newly-appeared high or critical exposures; no alerts raised`);
  }

  await notifyAlertsCreated(scan.organization_id, alerts);

  return { alerts, reason: 'drift' };
}

/**
 * A domain's first scan: one summary alert rather than one per finding.
 * Raised only when there is something at high or critical to report.
 */
async function raiseBaselineAlert(scan, exposures, attackPaths) {
  const severe = exposures.filter(f => ALERTING_SEVERITIES.has(f.severity));
  if (severe.length === 0 && attackPaths.length === 0) {
    logger.debug(`Scan ${scan.id}: baseline scan found nothing at high or critical; no alert raised`);
    return null;
  }

  const critical = severe.filter(f => f.severity === 'critical');
  const severity = critical.length > 0 || attackPaths.some(p => p.severity === 'critical')
    ? 'critical'
    : 'high';

  return createAlert({
    organizationId: scan.organization_id,
    severity,
    title: `Baseline external exposure for ${scan.seed_domain}: `
      + `${severe.length} finding(s), ${attackPaths.length} attack path(s)`,
    description:
      `The first external exposure scan of ${scan.seed_domain} (${scan.profile} profile) identified `
      + `${severe.length} exposure(s) at high or critical severity and assembled ${attackPaths.length} `
      + 'attack path(s).\n\n'
      + 'This is a baseline, so every finding is reported together rather than as separate alerts. '
      + 'Subsequent scans of this domain will alert only on what changes.\n\n'
      + (severe.length > 0
        ? `Findings: ${severe.map(f => f.title).join('; ')}\n`
        : '')
      + (attackPaths.length > 0
        ? `Attack paths: ${attackPaths.map(p => p.name).join('; ')}`
        : ''),
    source: {
      service: 'compliance',
      component: 'external_exposure',
      scanId: scan.id,
      seedDomain: scan.seed_domain,
      profile: scan.profile,
      isBaseline: true
    },
    affectedEntities: { seedDomain: scan.seed_domain },
    evidence: {
      findingIds: severe.map(f => f.finding_id),
      attackPathIds: attackPaths.map(p => p.path_id)
    },
    mitreTechniques: [...new Set(severe.map(f => f.mitre_technique).filter(Boolean))],
    recommendations: severe.slice(0, 5).map(f => f.remediation).filter(Boolean),
    tags: ['external-exposure', 'baseline'],
    metadata: { findingCount: severe.length, attackPathCount: attackPaths.length }
  });
}

function buildFindingDescription(scan, finding, previous) {
  const lines = [];

  if (finding.previousSeverity) {
    lines.push(
      `This exposure was already present but has escalated from ${finding.previousSeverity} to `
      + `${finding.severity} since the previous scan on `
      + `${new Date(previous.completed_at).toLocaleString()}.`
    );
  } else {
    lines.push(
      `This exposure was not present in the previous scan of ${scan.seed_domain} on `
      + `${new Date(previous.completed_at).toLocaleString()}.`
    );
  }

  if (finding.target) lines.push(`Target: ${finding.target}`);
  if (finding.description) lines.push('', finding.description);
  if (finding.impact) lines.push('', `Why it matters: ${finding.impact}`);

  return lines.join('\n');
}

function buildPathDescription(scan, path) {
  return [
    `A new attack chain became viable against ${scan.seed_domain} since the previous scan.`,
    '',
    path.narrative || '',
    '',
    `Effort: ${path.effort || 'unknown'}`,
    `Blast radius: ${path.blast_radius || 'unknown'}`
  ].join('\n');
}

/**
 * Insert an alert.
 *
 * ATT&CK techniques go into mitre_attack.techniques as a flat array — the shape
 * the SIEM export path reads — so recon alerts forward to a configured SIEM
 * with no extra wiring.
 */
async function createAlert(data) {
  return db.insert(
    `INSERT INTO maes.alerts
       (organization_id, severity, type, category, title, description, status,
        source, affected_entities, evidence, mitre_attack, recommendations, tags, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, severity, title`,
    [
      data.organizationId,
      data.severity,
      ALERT_TYPE,
      ALERT_CATEGORY,
      // The column is varchar(255); a long finding title would otherwise abort
      // the insert and lose the alert entirely.
      truncate(data.title, 255),
      data.description,
      JSON.stringify(data.source || {}),
      JSON.stringify(data.affectedEntities || {}),
      JSON.stringify(data.evidence || {}),
      JSON.stringify({ techniques: data.mitreTechniques || [] }),
      JSON.stringify(data.recommendations || []),
      data.tags || [],
      JSON.stringify(data.metadata || {})
    ]
  );
}

function truncate(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Ask the API to push these alerts to connected clients.
 *
 * This service writes alerts straight to the database from its own container
 * and so cannot reach the socket server. Without this hand-off the UI would
 * only learn about a new critical exposure on its next poll.
 *
 * Best effort by design: the alerts are already stored, and a scan must not
 * fail because a notification did not land.
 */
async function notifyAlertsCreated(organizationId, alerts) {
  if (!alerts || alerts.length === 0) return false;

  const apiUrl = process.env.API_SERVICE_URL || 'http://api:3000';
  const token = process.env.SERVICE_AUTH_TOKEN;

  if (!token) {
    logger.debug('No SERVICE_AUTH_TOKEN configured; skipping alert notification');
    return false;
  }

  try {
    await axios.post(`${apiUrl}/api/internal/notify/alerts-created`, {
      organizationId,
      alerts
    }, {
      headers: { 'x-service-token': token, 'Content-Type': 'application/json' },
      timeout: 5000
    });
    return true;
  } catch (error) {
    logger.warn(`Could not notify API of ${alerts.length} new alert(s): ${error.message}`);
    return false;
  }
}

module.exports = {
  raiseAlertsForScan,
  notifyAlertsCreated,
  findPreviousScan,
  createAlert,
  truncate,
  ALERTING_SEVERITIES,
  ALERT_TYPE,
  ALERT_CATEGORY
};
